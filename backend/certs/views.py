import os
import requests
from datetime import date
from rest_framework import generics, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q
from django.utils import timezone
from django.conf import settings
from .models import Certificado
from .serializers import CertificadoSerializer

def calc_status(vencimento):
    if not vencimento:
        return {'key': 'ok', 'label': 'EM DIA', 'dias': None}
    today = date.today()
    dias = (vencimento - today).days
    if dias < 0:
        return {'key': 'vencido', 'label': 'VENCIDO', 'dias': dias}
    if dias <= 15:
        return {'key': 'urgente', 'label': 'URGENTE', 'dias': dias}
    if dias <= 30:
        return {'key': 'atencao', 'label': 'ATENÇÃO', 'dias': dias}
    if dias <= 60:
        return {'key': 'proximo', 'label': 'PRÓXIMO', 'dias': dias}
    return {'key': 'ok', 'label': 'EM DIA', 'dias': dias}

class CertificadoListCreate(generics.ListCreateAPIView):
    serializer_class = CertificadoSerializer

    def get_queryset(self):
        qs = Certificado.objects.filter(deleted_at__isnull=True)
        search = self.request.query_params.get('search', '').lower()
        f_status = self.request.query_params.get('status', '')
        f_tipo = self.request.query_params.get('tipo', '')
        f_emissora = self.request.query_params.get('emissora', '')
        f_local = self.request.query_params.get('local', '')
        sort = self.request.query_params.get('sort', '')

        if search:
            qs = qs.filter(Q(nome__icontains=search) | Q(titular__icontains=search) | Q(documento__icontains=search))
        if f_status:
            hoje = date.today()
            if f_status == 'vencido':
                qs = qs.filter(vencimento__lt=hoje)
            elif f_status == 'vencendo30':
                qs = qs.filter(vencimento__gte=hoje, vencimento__lte=hoje)
                # filter manually after
            elif f_status == 'ok':
                qs = qs.filter(vencimento__gt=hoje)
        if f_tipo:
            qs = qs.filter(tipo=f_tipo)
        if f_emissora:
            qs = qs.filter(emissora__icontains=f_emissora)
        if f_local:
            qs = qs.filter(local__icontains=f_local)

        if sort == 'az':
            qs = qs.order_by('nome')
        elif sort == 'za':
            qs = qs.order_by('-nome')
        else:
            qs = qs.order_by('vencimento')

        # manual vencendo30 filter
        if f_status == 'vencendo30':
            filtered = []
            hoje = date.today()
            for c in qs:
                dias = (c.vencimento - hoje).days
                if 0 <= dias <= 30:
                    filtered.append(c)
            return filtered

        return list(qs)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data
        for item in data:
            venc = item.get('vencimento')
            if venc:
                y, m, d = venc.split('-')
                item['vencimento_fmt'] = f'{d}/{m}/{y}'
                em = item.get('emissao')
                if em:
                    y2, m2, d2 = em.split('-')
                    item['emissao_fmt'] = f'{d2}/{m2}/{y2}'
                else:
                    item['emissao_fmt'] = '—'
                venc_date = date.fromisoformat(venc)
                item['status'] = calc_status(venc_date)
            else:
                item['vencimento_fmt'] = '—'
                item['emissao_fmt'] = '—'
                item['status'] = {'key': 'ok', 'label': 'EM DIA', 'dias': None}
        return Response(data)

    def perform_create(self, serializer):
        serializer.save()

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        if not data.get('id'):
            from scripts import uid as _uid  # not available, generate inline
            import uuid
            data['id'] = 'c_' + str(uuid.uuid4().hex[:16])
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CertificadoDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CertificadoSerializer
    lookup_field = 'pk'

    def get_queryset(self):
        return Certificado.objects.filter(deleted_at__isnull=True)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = dict(serializer.data)
        venc = data.get('vencimento')
        if venc:
            y, m, d = venc.split('-')
            data['vencimento_fmt'] = f'{d}/{m}/{y}'
            em = data.get('emissao')
            if em:
                y2, m2, d2 = em.split('-')
                data['emissao_fmt'] = f'{d2}/{m2}/{y2}'
            else:
                data['emissao_fmt'] = '—'
            venc_date = date.fromisoformat(venc)
            data['status'] = calc_status(venc_date)
        else:
            data['vencimento_fmt'] = '—'
            data['emissao_fmt'] = '—'
            data['status'] = {'key': 'ok', 'label': 'EM DIA', 'dias': None}
        return Response(data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.deleted_at = timezone.now()
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CertificadoSocios(APIView):
    permission_classes = []

    def get(self, request, pk):
        try:
            cert = Certificado.objects.get(pk=pk, deleted_at__isnull=True)
        except Certificado.DoesNotExist:
            return Response({'detail': 'Certificado não encontrado'}, status=status.HTTP_404_NOT_FOUND)

        cnpj = ''.join(c for c in cert.documento if c.isdigit())
        if len(cnpj) != 14:
            return Response({'detail': 'CNPJ inválido'}, status=status.HTTP_400_BAD_REQUEST)

        token = getattr(settings, 'BRASILAPI_TOKEN', '')
        try:
            resp = requests.get(
                f'https://brasilapi.com.br/api/cnpj/v1/{cnpj}',
                headers={'Accept': 'application/json'},
                timeout=10,
            )
            resp.raise_for_status()
            return Response(resp.json())
        except requests.RequestException as e:
            return Response({'detail': f'Erro BrasilAPI: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)


class LixeiraList(generics.ListAPIView):
    serializer_class = CertificadoSerializer

    def get_queryset(self):
        return Certificado.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class LixeiraRestaurar(APIView):
    permission_classes = []

    def post(self, request, pk):
        try:
            cert = Certificado.objects.get(pk=pk, deleted_at__isnull=False)
        except Certificado.DoesNotExist:
            return Response({'detail': 'Não encontrado na lixeira'}, status=status.HTTP_404_NOT_FOUND)
        cert.deleted_at = None
        cert.save()
        return Response({'detail': 'Restaurado'}, status=status.HTTP_200_OK)


class LixeiraDeletePermanente(APIView):
    permission_classes = []

    def delete(self, request, pk):
        try:
            cert = Certificado.objects.get(pk=pk, deleted_at__isnull=False)
        except Certificado.DoesNotExist:
            return Response({'detail': 'Não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        cert.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
