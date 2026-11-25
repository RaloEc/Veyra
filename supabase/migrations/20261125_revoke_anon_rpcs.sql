-- T3.1: Revocar EXECUTE a PUBLIC/anon en funciones public expuestas (V-14, V-15)
-- Fecha: 2026-11-25

-- 1. Funciones internas / de mantenimiento / triggers: solo service_role / postgres
REVOKE ALL ON FUNCTION public.rpc_reconcile_storage_usage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_notify_reminder_state_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_owner_premium_status() FROM PUBLIC, anon, authenticated;

-- 2. RPCs y helpers de usuario: revocar PUBLIC/anon y permitir solo authenticated
REVOKE ALL ON FUNCTION public.accept_share_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_share_invitation(text) TO authenticated;

REVOKE ALL ON FUNCTION public.can_edit_attachment_target(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_attachment_target(text, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_read_attachment_target(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_attachment_target(text, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.has_active_upload_reservation(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_upload_reservation(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_target_collaborator(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_target_collaborator(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_guest_permission(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guest_permission(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_collaboration_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_collaboration_role(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_collaboration_role_by_member(text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_collaboration_role_by_member(text, text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_web_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_web_push_subscription(text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_yjs_activity(text, bigint, integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_yjs_activity(text, bigint, integer, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_yjs_activity(text, bigint, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_yjs_activity(text, bigint, integer, text) TO authenticated;
