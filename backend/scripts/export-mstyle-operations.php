<?php
/** Usage: wp eval-file /private/export-mstyle-operations.php /private/export-directory
 * Writes a private migration bundle, never modifies operational data.
 */
if (!defined('WP_CLI') || !WP_CLI) { exit(1); }
$target = isset($args[0]) ? realpath((string) $args[0]) : false;
$webRoot = realpath(ABSPATH);
if (!$target || !$webRoot || str_starts_with(str_replace('\\', '/', $target) . '/', str_replace('\\', '/', $webRoot) . '/')) {
    WP_CLI::error('Укажите существующую закрытую директорию за пределами web root.');
}
if (file_exists($target . '/manifest.json')) { WP_CLI::error('Директория уже содержит экспорт. Используйте новую директорию.'); }
global $wpdb;
$bundle = ['schema' => 'mstyle-operations-export-v1', 'export_id' => wp_generate_uuid4(), 'created_at' => gmdate('c'),
    'environment' => tf_mstyle_pass_config()['environment'], 'owner_mode' => tf_mstyle_ops_mode(), 'tables' => [], 'attachments' => []];
$tables = [];
foreach (['bookings', 'booking_segments', 'booking_services', 'payments', 'invoices', 'invoice_issuers', 'booking_events', 'balance_transactions', 'service_requests', 'service_request_messages', 'client_profiles'] as $name) {
    $tables[$name] = tf_mstyle_booking_db_table($name);
}
foreach (['principals', 'profile_links', 'membership_links', 'operation_links', 'resident_hour_accounts', 'booking_attendees'] as $name) { $tables['pass_' . $name] = tf_mstyle_pass_storage_table($name); }
// Consistent InnoDB snapshot; final export is made only during the write pause.
$wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
$wpdb->query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
try {
    foreach ($tables as $name => $table) {
        if ((string) $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) !== $table) { throw new RuntimeException('Не найдена таблица: ' . $name); }
        $rows = $wpdb->get_results('SELECT * FROM `' . str_replace('`', '``', $table) . '` ORDER BY id', ARRAY_A);
        if ($wpdb->last_error) { throw new RuntimeException('Ошибка чтения: ' . $name); }
        // Do not export authentication material; only stable relation ids and hour state.
        if ($name === 'pass_principals') {
            $rows = array_map(static fn($row) => array_intersect_key($row, array_flip(['id', 'pass_subject', 'pass_environment', 'legacy_user_id', 'balance_min', 'resident_hours_accrual_date', 'resident_hours_expires_date'])), $rows);
        }
        if ($name === 'bookings') {
            foreach ($rows as &$row) {
                if (empty($row['pass_snapshot_id']) && !empty($row['client_snapshot_json'])) {
                    $decoded = tf_mstyle_booking_booking_snapshot_decode($row['client_snapshot_json']);
                    if (empty($decoded['ok'])) { throw new RuntimeException('Не удалось прочитать снимок заявки ' . (int) $row['id']); }
                    $row['legacy_snapshot'] = $decoded['data'];
                }
            }
            unset($row);
        }
        $bundle['tables'][$name] = $rows;
    }
    $knownAccounts = array_fill_keys(array_column($bundle['tables']['pass_resident_hour_accounts'], 'resource_profile_id'), true);
    foreach ($bundle['tables']['pass_profile_links'] as $link) {
        $resource = $link['resource_owner_profile_id'] ?: $link['pass_profile_id'];
        if (!$resource || isset($knownAccounts[$resource])) { continue; }
        $knownAccounts[$resource] = true;
        $principal = tf_mstyle_pass_resident_hours_legacy_source_principal($resource);
        $policy = tf_mstyle_pass_resident_hours_resource_policy_link($resource) ?: [];
        $bundle['tables']['pass_resident_hour_accounts'][] = [
            'id' => 'lazy:' . $resource, 'resource_profile_id' => $resource,
            'balance_min' => (int) ($principal['balance_min'] ?? 0),
            'resident_hours_accrual_date' => $principal['resident_hours_accrual_date'] ?? null,
            'resident_hours_expires_date' => $principal['resident_hours_expires_date'] ?? null,
            'applied_monthly_quota_min' => (int) ($policy['resident_hours_monthly_quota_min'] ?? 0),
            'applied_monthly_reset_day' => (int) ($policy['resident_hours_monthly_reset_day'] ?? 1),
            'migrated_from_principal_id' => $principal['id'] ?? null,
            'created_at' => $principal['created_at'] ?? $bundle['created_at'], 'updated_at' => $principal['updated_at'] ?? $bundle['created_at'],
        ];
    }
    $bundle['catalog'] = tf_mstyle_ops_catalog_export();
    $bundle['payment_settings'] = tf_mstyle_yookassa_settings();
    $wpdb->query('COMMIT');
    $seen = [];
    foreach ($bundle['tables']['service_request_messages'] as $message) {
        foreach ((array) json_decode((string) ($message['attachments_json'] ?? '[]'), true) as $attachment) {
            $id = (int) ($attachment['attachment_id'] ?? 0);
            if (!$id || isset($seen[$id])) { continue; } $seen[$id] = true;
            $path = get_attached_file($id);
            if (!$path || !is_file($path)) { throw new RuntimeException('Не найден файл вложения ' . $id); }
            $name = 'attachment-' . $id . '.bin';
            if (!copy($path, $target . '/' . $name)) { throw new RuntimeException('Ошибка копирования вложения ' . $id); }
            chmod($target . '/' . $name, 0600);
            $bundle['attachments'][] = ['id' => $id, 'request_id' => (int) $message['request_id'], 'message_id' => (int) $message['id'],
                'path' => $name, 'size' => filesize($path), 'sha256' => hash_file('sha256', $path),
                'original_name' => $attachment['original_name'] ?? basename($path), 'mime_type' => $attachment['mime_type'] ?? get_post_mime_type($id)];
        }
    }
    $json = wp_json_encode($bundle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if (!is_string($json) || file_put_contents($target . '/manifest.json', $json, LOCK_EX) === false) { throw new RuntimeException('Ошибка записи экспорта.'); }
    chmod($target . '/manifest.json', 0600);
    file_put_contents($target . '/manifest.sha256', hash('sha256', $json) . "\n", LOCK_EX);
    WP_CLI::success('Экспорт сохранён. Записей: ' . array_sum(array_map('count', $bundle['tables'])) . '; файлов: ' . count($bundle['attachments']));
} catch (Throwable $e) {
    $wpdb->query('ROLLBACK'); WP_CLI::error($e->getMessage());
}
