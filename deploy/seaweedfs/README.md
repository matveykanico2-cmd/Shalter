# SeaweedFS для Shalter

Это production-конфигурация S3-compatible object storage. Она рассчитана на
три master-реплики, три volume-реплики, два filer и два S3 gateway. Данные
должны лежать на разных persistent disks/узлах; один сервер и один диск не
являются резервным хранилищем.

Установка:

```bash
helm repo add seaweedfs https://seaweedfs.github.io/seaweedfs/helm
helm repo update
kubectl create namespace shalter-storage
helm upgrade --install seaweedfs seaweedfs/seaweedfs \
  --namespace shalter-storage \
  -f deploy/seaweedfs/values.yaml
```

Перед установкой замените `CHANGE_ME_IN_K8S_SECRET` на секрет из Kubernetes
Secret/Secret management. В production лучше не хранить ключ в values-файле.

Для Shalter задайте на API-сервере:

```env
S3_BUCKET=shalter-uploads
S3_ACCESS_KEY=shalter
S3_SECRET_KEY=...
S3_ENDPOINT=http://seaweedfs-s3:8333
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=1
S3_SSE=bucket
S3_ENABLE_VERSIONING=1
S3_AUTO_MIGRATE=1
S3_MIGRATE_KEEP_LOCAL=1
```

Проверка перед очисткой локального диска:

```bash
npm run s3:verify
npm run uploads:to-s3 -- --dry-run
```

Сначала проверьте несколько старых фото, видео, голосовых и документов в
приложении. Только после этого меняйте `S3_MIGRATE_KEEP_LOCAL=0` и удаляйте
локальную копию отдельным согласованным шагом.
