-- T1.7: Revocar INSERT directo de clientes sobre public.profiles (V-03)
-- El trigger on_auth_user_created (SECURITY DEFINER) crea el perfil en signup.
REVOKE INSERT ON TABLE public.profiles FROM authenticated;
REVOKE INSERT ON TABLE public.profiles FROM anon;
