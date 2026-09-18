import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@patrimonio.local', '1324')
    print('Superuser admin/1324 criado com sucesso.')
else:
    print('Superuser admin ja existe.')
