<?php
/** Offline regression for the real WordPress theme login/session/operations functions. */
define('ABSPATH', __DIR__);
define('DAY_IN_SECONDS', 86400);
define('ARRAY_A', 'ARRAY_A');
define('TF_MSTYLE_OPERATIONS_OWNER', 'pass');

// Load unchanged function bodies; replace only WordPress storage and the HTTP boundary.
function load_theme_functions(string $file, array $wanted): void
{
    $tokens = token_get_all(file_get_contents($file));
    $found = [];
    for ($i = 0; $i < count($tokens); $i++) {
        if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_FUNCTION) { continue; }
        $j = $i + 1;
        while (is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) { $j++; }
        if (!is_array($tokens[$j]) || $tokens[$j][0] !== T_STRING) { continue; }
        $name = $tokens[$j][1];
        if (!in_array($name, $wanted, true)) { continue; }
        $body = ''; $depth = 0; $opened = false;
        for (; $i < count($tokens); $i++) {
            $token = $tokens[$i];
            $body .= is_array($token) ? $token[1] : $token;
            if ($token === '{') { $depth++; $opened = true; }
            if ($token === '}' && --$depth === 0 && $opened) { break; }
        }
        eval($body);
        $found[] = $name;
    }
    $missing = array_diff($wanted, $found);
    if ($missing) { throw new RuntimeException('Missing source functions: ' . implode(', ', $missing)); }
}

class WP_REST_Response
{
    public function __construct(public array $data, public int $status = 200) {}
}
function add_action(...$args): void {}
function add_filter(...$args): void {}
function sanitize_key($value): string { return preg_replace('/[^a-z0-9_\-]/', '', strtolower($value)); }
function wp_json_encode($value): string { return json_encode($value, JSON_THROW_ON_ERROR); }
function wp_salt($scheme): string { return 'offline-regression-secret'; }
function is_ssl(): bool { return true; }
function tf_mstyle_booking_now_msk(): DateTimeImmutable { return new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow')); }
function tf_mstyle_booking_db_table($entity): string { return 'test_' . $entity; }
function tf_mstyle_booking_db_table_exists($entity): bool { return true; }
function tf_mstyle_pass_now_sql(): string { return tf_mstyle_booking_now_msk()->format('Y-m-d H:i:s'); }
function tf_mstyle_pass_request_context(): array { return []; }
function tf_mstyle_pass_idempotency_key(): string { return 'idem_offline_login_check'; }
function tf_mstyle_pass_command_attempt_resolve_token(...$args): string { return 'idem_offline_operation_check'; }
function tf_mstyle_auth_response(array $payload, int $http): WP_REST_Response { return new WP_REST_Response($payload, $http); }
function tf_mstyle_auth_error(string $code, string $message, int $http): WP_REST_Response
{
    return tf_mstyle_auth_response(['ok' => false, 'error' => ['code' => $code, 'message' => $message]], $http);
}

class SessionDatabase
{
    public array $rows = [];
    public string $last_error = '';
    public function prepare(string $query, ...$args): array { return [$query, $args]; }
    public function insert($table, array $data, $formats): bool
    {
        $GLOBALS['events'][] = 'session.create';
        if ($GLOBALS['scenario'] === 'insert_failure') { return false; }
        $data['id'] = count($this->rows) + 1;
        $this->rows[] = $data;
        return true;
    }
    public function delete($table, array $where, $formats): bool
    {
        $this->rows = array_values(array_filter($this->rows, fn($row) => $row['token_hash'] !== $where['token_hash']));
        return true;
    }
    public function update($table, array $data, array $where, ...$formats): int
    {
        foreach ($this->rows as &$row) {
            if (array_intersect_assoc($row, $where) === $where) { $row = array_merge($row, $data); }
        }
        return 1;
    }
    public function get_row(array $query, $format): ?array
    {
        [$sql, $args] = $query;
        foreach ($this->rows as $row) {
            if ($row['token_hash'] === $args[0] && $row['revoked_at'] === null && $row['expires_at'] > $args[1]) { return $row; }
        }
        return null;
    }
}

$theme = $argv[1] ?? '';
$scenario = $argv[2] ?? 'success';
$authFile = $argv[3] ?? ($theme . '/inc/pass/auth.php');
if (!is_dir($theme)) { fwrite(STDERR, "Theme directory is required\n"); exit(2); }
$events = []; $operations = []; $flowUpdates = [];
$wpdb = new SessionDatabase();
$subject = 'usr_' . str_repeat('a', 20);
$authenticationId = 'aut_' . str_repeat('b', 20);
$profileId = 'prf_' . str_repeat('c', 20);
$principal = ['id' => 7, 'pass_subject' => $subject, 'auth_version' => 3, 'legacy_user_id' => 0];
$link = ['id' => 11, 'principal_id' => 7, 'pass_profile_id' => $profileId, 'admin_route_id' => 8000000000000011];
$auth = ['schemaVersion' => '2.0', 'subject' => $subject, 'authenticationId' => $authenticationId,
    'identityStatus' => 'active', 'authVersion' => 3, 'authenticatedAt' => gmdate('Y-m-d\TH:i:s\Z'), 'authenticationMethod' => 'sms'];
$context = ['subject' => $subject, 'identityStatus' => 'active', 'authVersion' => 3, 'contextRevision' => 1,
    'profiles' => [['profileId' => $profileId, 'profileType' => 'individual', 'profileStatus' => 'active',
        'membershipStatus' => 'active', 'membershipRole' => 'owner', 'privateDataComplete' => true, 'display' => ['label' => 'Test']]]];
$flow = ['id' => 1, 'pass_challenge_id' => 'ach_' . str_repeat('d', 20), 'channel' => 'sms',
    'identifier_mode' => 'phone', 'flow_kind' => 'login', 'code_length' => 4, 'status' => 'awaiting_code'];

function tf_mstyle_pass_principal_by_id(int $id): ?array { return $id === 7 ? $GLOBALS['principal'] : null; }
function tf_mstyle_pass_principal_selected_profile_id(int $id): string { return $GLOBALS['profileId']; }
function tf_mstyle_pass_resident_hours_resource_profile_id(string $id): string { return $id; }
function tf_mstyle_pass_profile_links_for_principal(int $id): array { return [$GLOBALS['link']]; }
function tf_mstyle_pass_profile_link_by_id(int $id): ?array { return $GLOBALS['link']; }
function tf_mstyle_pass_store_context_links(...$args): array { return ['ok' => true, 'principal_id' => 7]; }
function tf_mstyle_pass_auth_flow_update(int $id, array $update): bool
{
    $GLOBALS['flowUpdates'][] = $update;
    if (($update['status'] ?? '') === 'consumed') {
        $GLOBALS['events'][] = 'flow.consume';
        if ($GLOBALS['scenario'] === 'flow_failure') { return false; }
    }
    return true;
}
function tf_mstyle_pass_fetch_resident_context(...$args): array { return ['ok' => true, 'data' => $GLOBALS['context']]; }
function tf_mstyle_pass_call($endpoint, $path, $query, $body, $options): array
{
    if ($endpoint === 'A-06') {
        $GLOBALS['events'][] = 'code.verify';
        if ($GLOBALS['scenario'] === 'invalid_code') { return ['ok' => false, 'code' => 'invalid_code', 'http_status' => 400]; }
        return ['ok' => true, 'data' => $GLOBALS['auth']];
    }
    if ($endpoint !== 'O-02') { throw new RuntimeException('Unexpected endpoint'); }
    // A real Pass service requires the exact verified resident authentication.
    if (($options['resident_subject'] ?? '') !== $GLOBALS['subject']
        || ($options['step_up_authentication_id'] ?? '') !== $GLOBALS['authenticationId']) {
        throw new RuntimeException('Wrong resident authentication', 401);
    }
    $action = $body['action'];
    $GLOBALS['events'][] = $action;
    $GLOBALS['operations'][] = $options;
    if ($GLOBALS['scenario'] === 'policy_failure' || ($GLOBALS['scenario'] === 'hours_failure' && $action === 'hours.get')) {
        return ['ok' => false, 'http_status' => 503, 'data' => ['error' => ['code' => 'service_unavailable', 'message' => 'Offline failure']]];
    }
    if ($GLOBALS['scenario'] === 'settings_failure' && $action === 'profile.policy') {
        return ['ok' => true, 'data' => []];
    }
    return ['ok' => true, 'data' => $action === 'profile.policy'
        ? ['prepay_required' => true, 'preferred_invoice_issuer_id' => 6]
        : ['account' => ['balance_min' => 300, 'available_balance_min' => 240]]];
}

require $theme . '/inc/pass/operations.php';
require $theme . '/inc/booking/session.php';
load_theme_functions($theme . '/inc/pass/client.php', ['tf_mstyle_pass_id_matches']);
load_theme_functions($authFile, [
    'tf_mstyle_pass_auth_error_response', 'tf_mstyle_pass_auth_iso_datetime_valid', 'tf_mstyle_pass_auth_exact_keys',
    'tf_mstyle_pass_auth_channel_matches_mode', 'tf_mstyle_pass_auth_code_valid', 'tf_mstyle_pass_auth_flow_contract',
    'tf_mstyle_pass_auth_validate_result', 'tf_mstyle_pass_auth_validate_context_binding', 'tf_mstyle_pass_auth_verify',
]);
load_theme_functions($theme . '/inc/pass/adapters.php', [
    'tf_mstyle_pass_public_error_field_key', 'tf_mstyle_pass_public_field_errors', 'tf_mstyle_pass_public_error_code',
    'tf_mstyle_pass_public_error_for_surface', 'tf_mstyle_pass_resident_auth_error_for_mstyle',
    'tf_mstyle_pass_context_has_active_profile', 'tf_mstyle_pass_profile_type_for_mstyle',
    'tf_mstyle_pass_booking_profile_settings_result', 'tf_mstyle_pass_contact_masks_by_type',
    'tf_mstyle_pass_active_booking_profiles', 'tf_mstyle_pass_build_booking_context',
]);
load_theme_functions($theme . '/inc/pass/storage.php', [
    'tf_mstyle_pass_profile_local_settings', 'tf_mstyle_pass_admin_route_id_for_profile_link', 'tf_mstyle_pass_profile_public_id_for_link',
    'tf_mstyle_pass_principal_resident_hours_resource_profile_id', 'tf_mstyle_pass_principal_available_balance_min',
    'tf_mstyle_pass_resource_profile_available_balance_min', 'tf_mstyle_pass_resource_profile_balance_state',
]);

function check(bool $condition, string $message): void { if (!$condition) { throw new RuntimeException($message); } }
try {
    if ($scenario === 'context_subject_mismatch') { $context['subject'] = 'usr_' . str_repeat('z', 20); }
    if ($scenario === 'context_version_mismatch') { $context['authVersion'] = 4; }
    if ($scenario === 'inactive_identity') { $auth['identityStatus'] = 'inactive'; }
    if ($scenario === 'no_active_profile') { $context['profiles'][0]['membershipStatus'] = 'inactive'; }
    if ($scenario === 'settings_failure') { $link['legacy_profile_id'] = 19; }
    if ($scenario === 'existing_session') {
        $oldPrincipal = ['id' => 8, 'pass_subject' => 'usr_' . str_repeat('x', 20)];
        tf_mstyle_booking_session_create_for_pass_principal($oldPrincipal, array_replace($auth, ['subject' => $oldPrincipal['pass_subject'], 'authenticationId' => 'aut_' . str_repeat('y', 20)]));
        $events = [];
    }
    if ($scenario === 'anonymous') {
        try { tf_mstyle_ops_call('hours.get', ['profile_id' => $profileId]); throw new LogicException('Anonymous request was accepted'); }
        catch (RuntimeException $error) { check($error->getCode() === 401, 'Anonymous request must stay unauthorized'); }
    } else {
        // Sending output before login deliberately makes setcookie fail.
        if ($scenario === 'cookie_failure') { echo "headers already sent\n"; }
        $response = tf_mstyle_pass_auth_verify('public_offline_token', '1234', $flow);
        if (in_array($scenario, ['success', 'existing_session'], true)) {
            check($response->status === 200 && !empty($response->data['ok']), 'Login must succeed');
            check($response->data['session']['booking']['balance_min'] === 240, 'Return the current available Pass balance');
            check($response->data['session']['booking']['profiles'][0]['prepay_required'] === true, 'Return current profile rules');
            check($events === ['code.verify', 'flow.consume', 'session.create', 'profile.policy', 'hours.get'], 'Authenticate before protected context reads');
            check(!empty(tf_mstyle_booking_session_get_current_record(false)['authenticated']), 'New session must persist');
        } else {
            check(empty($response->data['ok']), 'Invalid or incomplete login must fail');
            check(empty(tf_mstyle_booking_session_get_current_record(false)['authenticated']), 'Failed login must leave no active browser session');
            if (in_array($scenario, ['policy_failure', 'hours_failure', 'settings_failure'], true)) {
                check(count($wpdb->rows) === 1 && $wpdb->rows[0]['revoked_at'] !== null, 'Context failure must revoke the newly created session');
            } else { check(count($wpdb->rows) === 0, 'Rejected verification must not create a session'); }
        }
    }
    echo json_encode(['scenario' => $scenario, 'ok' => true], JSON_UNESCAPED_UNICODE) . "\n";
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['scenario' => $scenario, 'ok' => false, 'message' => $error->getMessage()], JSON_UNESCAPED_UNICODE) . "\n");
    exit(1);
}
