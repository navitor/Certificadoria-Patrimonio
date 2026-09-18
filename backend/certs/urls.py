from django.urls import path
from . import views

urlpatterns = [
    path('', views.CertificadoListCreate.as_view(), name='cert-list-create'),
    path('<str:pk>/', views.CertificadoDetail.as_view(), name='cert-detail'),
    path('<str:pk>/socios/', views.CertificadoSocios.as_view(), name='cert-socios'),
    path('lixeira/', views.LixeiraList.as_view(), name='lixeira-list'),
    path('lixeira/<str:pk>/restaurar/', views.LixeiraRestaurar.as_view(), name='lixeira-restaurar'),
    path('lixeira/<str:pk>/permanente/', views.LixeiraDeletePermanente.as_view(), name='lixeira-delete'),
]
