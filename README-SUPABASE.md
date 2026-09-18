# Подключение музея к Supabase

1. Создайте проект Supabase.
2. Откройте SQL Editor и выполните supabase-schema.sql.
3. Создайте Storage buckets: museum-photos, museum-videos, museum-audio.
4. Сделайте эти buckets публичными, если материалы музея должны быть доступны посетителям без входа.
5. В supabase-config.js вставьте Project URL и publishable/anon key из Project Settings → API.
6. Никогда не вставляйте service_role/secret key в сайт.
7. После заполнения config сайт сможет использовать Supabase как источник данных.

Важно: текущая система логина разработчиков/администраторов остаётся локальной. Для настоящего многопользовательского администрирования следующим этапом нужно перенести авторизацию в Supabase Auth и закрыть INSERT/UPDATE/DELETE политиками RLS.
