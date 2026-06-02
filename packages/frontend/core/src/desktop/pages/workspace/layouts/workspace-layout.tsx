import { uniReactRoot } from '@affine/component';
import { AiLoginRequiredModal } from '@affine/core/components/affine/auth/ai-login-required';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { useResponsiveSidebar } from '@affine/core/components/hooks/use-responsive-siedebar';
import { SWRConfigProvider } from '@affine/core/components/providers/swr-config-provider';
import { WorkspaceSideEffects } from '@affine/core/components/providers/workspace-side-effects';
import { AIIsland } from '@affine/core/desktop/components/ai-island';
import { AppContainer } from '@affine/core/desktop/components/app-container';
import { DocumentTitle } from '@affine/core/desktop/components/document-title';
import { WorkspaceDialogs } from '@affine/core/desktop/dialogs';
import { AuthService, DefaultServerService } from '@affine/core/modules/cloud';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
import { QuotaCheck } from '@affine/core/modules/quota';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { ServerFeature } from '@affine/graphql';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import type { PropsWithChildren } from 'react';
import { useLayoutEffect } from 'react';

const WorkspaceAuthGuard = ({ children }: PropsWithChildren) => {
  const authService = useService(AuthService);
  const defaultServerService = useService(DefaultServerService);
  const sessionStatus = useLiveData(authService.session.status$);
  const enableLocalWorkspace =
    useLiveData(
      defaultServerService.server.config$.selector(
        c =>
          c.features.includes(ServerFeature.LocalWorkspace) ||
          BUILD_CONFIG.isNative
      )
    ) ?? true;
  const { jumpToSignIn } = useNavigateHelper();

  useLayoutEffect(() => {
    if (!enableLocalWorkspace && sessionStatus === 'unauthenticated') {
      jumpToSignIn();
    }
  }, [enableLocalWorkspace, sessionStatus, jumpToSignIn]);

  if (!enableLocalWorkspace && sessionStatus !== 'authenticated') {
    return null;
  }

  return <>{children}</>;
};

export const WorkspaceLayout = function WorkspaceLayout({
  children,
}: PropsWithChildren) {
  const currentWorkspace = useService(WorkspaceService).workspace;
  return (
    <WorkspaceAuthGuard>
    <SWRConfigProvider>
      <WorkspaceDialogs />

      {/* ---- some side-effect components ---- */}
      {currentWorkspace?.flavour !== 'local' ? (
        <QuotaCheck workspaceMeta={currentWorkspace.meta} />
      ) : null}
      <AiLoginRequiredModal />
      <WorkspaceSideEffects />
      <PeekViewManagerModal />
      <DocumentTitle />

      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      {/* should show after workspace loaded */}
      {/* FIXME: wait for better ai, <WorkspaceAIOnboarding /> */}
      <AIIsland />
      <uniReactRoot.Root />
    </SWRConfigProvider>
    </WorkspaceAuthGuard>
  );
};

/**
 * Wraps the workspace layout main router view
 */
const WorkspaceLayoutUIContainer = ({ children }: PropsWithChildren) => {
  const workbench = useService(WorkbenchService).workbench;
  const currentPath = useLiveData(
    LiveData.computed(get => {
      return get(workbench.basename$) + get(workbench.location$).pathname;
    })
  );
  useResponsiveSidebar();

  return (
    <AppContainer data-current-path={currentPath}>{children}</AppContainer>
  );
};
const WorkspaceLayoutInner = ({ children }: PropsWithChildren) => {
  return <WorkspaceLayoutUIContainer>{children}</WorkspaceLayoutUIContainer>;
};
