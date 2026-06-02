import { NavbarIcon } from '@connaxis/brand';
import clsx from 'clsx';
import type { FC } from 'react';

import { authHeaderWrapper } from './share.css';

export const AuthHeader: FC<{
  title: string;
  subTitle?: string;
  className?: string;
}> = ({ title, subTitle, className }) => {
  return (
    <div className={clsx(authHeaderWrapper, className)}>
      <p>
        <NavbarIcon size={24} />
        {title}
      </p>
      <p>{subTitle}</p>
    </div>
  );
};
