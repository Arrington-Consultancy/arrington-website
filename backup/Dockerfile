# Weekly copy of the website database into Tom's Google Drive.
#
# Built by the Railway cron service "db-backup-to-drive" (root directory
# /backup, so this is the Dockerfile Railway finds), which runs the
# container to completion on its schedule. The base image is the same
# major version as the production database (postgres-ssl:18), because
# pg_dump refuses to dump a server newer than itself.
#
# The postgres image's own ENTRYPOINT starts a database server; it is
# cleared here so the container runs the backup script and exits.
FROM postgres:18-alpine

RUN apk add --no-cache bash curl jq coreutils

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod 0755 /usr/local/bin/backup.sh

ENTRYPOINT []
CMD ["bash", "/usr/local/bin/backup.sh"]
