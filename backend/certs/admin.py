from django.contrib import admin
from .models import Certificado

@admin.register(Certificado)
class CertificadoAdmin(admin.ModelAdmin):
    list_display = ('id', 'nome', 'titular', 'documento', 'tipo', 'modelo', 'vencimento', 'emissora', 'responsavel', 'deleted_at')
    list_filter = ('tipo', 'modelo', 'deleted_at', 'vencimento')
    search_fields = ('nome', 'titular', 'documento', 'emissora', 'responsavel')
    ordering = ('vencimento',)
    readonly_fields = ('id', 'created_at', 'updated_at')
