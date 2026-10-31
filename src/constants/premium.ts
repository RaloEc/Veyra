export const PREMIUM_WHITELIST_EMAILS = [
    'ricardo.lopez.18.ralo@gmail.com',
    'ralito1313@gmail.com',
    'samanta18@gmail.com',
];

export const isWhitelistedPremiumEmail = (email?: string | null): boolean => {
    if (!email) return false;
    return PREMIUM_WHITELIST_EMAILS.includes(email.toLowerCase().trim());
};
