import { memo } from 'react';

import logoUrl from '../assets/logo.svg';

/** Horizontal logo — use where AFFiNE showed its text logo (149×48 slot) */
export const Logo = memo(function Logo() {
  return (
    <img
      src={logoUrl}
      alt="Connaxis"
      width={149}
      height={48}
      style={{ objectFit: 'contain' }}
    />
  );
});

/** Square icon — use in onboarding / large contexts (120×120 slot) */
export const AppIcon = memo(function AppIcon() {
  return (
    <img
      src={logoUrl}
      alt="Connaxis"
      width={120}
      height={120}
      style={{ objectFit: 'contain' }}
    />
  );
});
