from django.db import models
from datetime import date

class Certificado(models.Model):
    TIPO_CHOICES = [
        ('e-CPF', 'e-CPF'),
        ('e-CNPJ', 'e-CNPJ'),
        ('NF-e', 'NF-e'),
        ('SSL', 'SSL'),
        ('Outro', 'Outro'),
    ]
    MODELO_CHOICES = [('A1', 'A1'), ('A3', 'A3')]

    id = models.CharField(max_length=50, primary_key=True)
    nome = models.CharField(max_length=200)
    titular = models.CharField(max_length=200)
    documento = models.CharField(max_length=20, blank=True)
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES, default='e-CPF')
    modelo = models.CharField(max_length=2, choices=MODELO_CHOICES, default='A1')
    emissao = models.DateField(null=True, blank=True)
    vencimento = models.DateField()
    emissora = models.CharField(max_length=100, blank=True)
    local = models.CharField(max_length=200, blank=True)
    responsavel = models.CharField(max_length=100, blank=True)
    obs = models.TextField(blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['vencimento']
        indexes = [models.Index(fields=['tipo', 'vencimento']), models.Index(fields=['deleted_at'])]

    def __str__(self):
        return self.nome
