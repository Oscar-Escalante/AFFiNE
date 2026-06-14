import {
  AddPageButton,
  AppSidebar,
  MenuItem,
  MenuLinkItem,
  QuickSearchInput,
  SidebarContainer,
  SidebarScrollableContainer,
} from '@affine/core/modules/app-sidebar/views';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { CMDKQuickSearchService } from '@affine/core/modules/quicksearch/services/cmdk';
import type { Workspace } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { Store } from '@blocksuite/affine/store';
import {
  Folder as FolderNavIcon,
  GearSix as SettingsIcon,
  ArrowSquareIn as ImportIcon,
  Robot as AiOutlineIcon,
} from '@phosphor-icons/react/dist/ssr';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { memo, useCallback, useMemo } from 'react';

import {
  CollapsibleSection,
  NavigationPanelCollections,
  NavigationPanelFavorites,
  NavigationPanelMigrationFavorites,
  NavigationPanelOrganize,
  NavigationPanelTags,
} from '../../desktop/components/navigation-panel';
import { NavigationPanelService } from '../../modules/navigation-panel';
import { WorkbenchService } from '../../modules/workbench';
import { WorkspaceNavigator } from '../workspace-selector';
import {
  bottomContainer,
  folderTreeSection,
  quickSearch,
  quickSearchAndNewPage,
  workspaceAndUserWrapper,
  workspaceWrapper,
} from './index.css';
import { InviteMembersButton } from './invite-members-button';
import { AppSidebarJournalButton } from './journal-button';
import { NotificationButton } from './notification-button';
import { SidebarAudioPlayer } from './sidebar-audio-player';
import { TemplateDocEntrance } from './template-doc-entrance';
import { TrashButton } from './trash-button';
import { UpdaterButton } from './updater-button';
import UserInfo from './user-info';

export type RootAppSidebarProps = {
  isPublicWorkspace: boolean;
  onOpenQuickSearchModal: () => void;
  onOpenSettingModal: () => void;
  currentWorkspace: Workspace;
  openPage: (pageId: string) => void;
  createPage: () => Store;
  paths: {
    all: (workspaceId: string) => string;
    trash: (workspaceId: string) => string;
    shared: (workspaceId: string) => string;
  };
};

const FoldersButton = () => {
  const t = useI18n();
  const { workbenchService } = useServices({ WorkbenchService });
  const navigationPanelService = useService(NavigationPanelService);
  const workbench = workbenchService.workbench;
  const path = useMemo(() => ['organize'], []);
  const collapsed = useLiveData(navigationPanelService.collapsed$(path));
  const active = useLiveData(
    workbench.location$.selector(location => location.pathname === '/all')
  );

  const handleCollapsedChange = useCallback(
    (v: boolean) => navigationPanelService.setCollapsed(path, v),
    [navigationPanelService, path]
  );

  const handleClick = useCallback(() => {
    workbench.open('/all');
  }, [workbench]);

  return (
    <MenuItem
      icon={<FolderNavIcon weight="duotone" />}
      active={active}
      collapsed={collapsed}
      onCollapsedChange={handleCollapsedChange}
      onClick={handleClick}
    >
      <span>{t['com.affine.rootAppSidebar.organize']()}</span>
    </MenuItem>
  );
};


const AIChatButton = () => {
  const t = useI18n();
  const featureFlagService = useService(FeatureFlagService);
  const serverService = useService(ServerService);
  const serverFeatures = useLiveData(serverService.server.features$);
  const enableAI = useLiveData(featureFlagService.flags.enable_ai.$);

  const { workbenchService } = useServices({
    WorkbenchService,
  });
  const workbench = workbenchService.workbench;
  const aiChatActive = useLiveData(
    workbench.location$.selector(location => location.pathname === '/chat')
  );

  if (!enableAI || !serverFeatures?.copilot) {
    return null;
  }

  return (
    <MenuLinkItem icon={<AiOutlineIcon weight="duotone" />} active={aiChatActive} to={'/chat'}>
      <span data-testid="ai-chat">
        {t['com.affine.workspaceSubPath.chat']()}
      </span>
    </MenuLinkItem>
  );
};

/**
 * This is for the whole affine app sidebar.
 * This component wraps the app sidebar in `@affine/component` with logic and data.
 *
 */
export const RootAppSidebar = memo((): ReactElement => {
  const { workbenchService, cMDKQuickSearchService, authService } = useServices(
    {
      WorkbenchService,
      CMDKQuickSearchService,
      AuthService,
    }
  );

  const sessionStatus = useLiveData(authService.session.status$);
  const t = useI18n();
  const workspaceDialogService = useService(WorkspaceDialogService);
  const workbench = workbenchService.workbench;
  const workspaceSelectorOpen = useLiveData(workbench.workspaceSelectorOpen$);
  const onOpenQuickSearchModal = useCallback(() => {
    cMDKQuickSearchService.toggle();
  }, [cMDKQuickSearchService]);

  const onWorkspaceSelectorOpenChange = useCallback(
    (open: boolean) => {
      workbench.setWorkspaceSelectorOpen(open);
    },
    [workbench]
  );

  const onOpenSettingModal = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'appearance',
    });
    track.$.navigationPanel.$.openSettings();
  }, [workspaceDialogService]);

  const handleOpenDocs = useCallback(
    (result: {
      docIds: string[];
      entryId?: string;
      isWorkspaceFile?: boolean;
    }) => {
      const { docIds, entryId, isWorkspaceFile } = result;
      // If the imported file is a workspace file, open the entry page.
      if (isWorkspaceFile && entryId) {
        workbench.openDoc(entryId);
      } else if (!docIds.length) {
        return;
      }
      // Open all the docs when there are multiple docs imported.
      if (docIds.length > 1) {
        workbench.openAll();
      } else {
        // Otherwise, open the only doc.
        workbench.openDoc(docIds[0]);
      }
    },
    [workbench]
  );

  const onOpenImportModal = useCallback(() => {
    track.$.navigationPanel.importModal.open();
    workspaceDialogService.open('import', undefined, payload => {
      if (!payload) {
        return;
      }
      handleOpenDocs(payload);
    });
  }, [workspaceDialogService, handleOpenDocs]);

  return (
    <AppSidebar>
      <SidebarContainer>
        <div className={workspaceAndUserWrapper}>
          <div className={workspaceWrapper}>
            <WorkspaceNavigator
              showEnableCloudButton
              showSyncStatus
              open={workspaceSelectorOpen}
              onOpenChange={onWorkspaceSelectorOpenChange}
              dense
            />
          </div>
          <UserInfo />
        </div>
        <div className={quickSearchAndNewPage}>
          <QuickSearchInput
            className={quickSearch}
            data-testid="slider-bar-quick-search-button"
            data-event-props="$.navigationPanel.$.quickSearch"
            onClick={onOpenQuickSearchModal}
          />
          <AddPageButton />
        </div>
        <FoldersButton />
      </SidebarContainer>
      <div className={folderTreeSection}>
        <NavigationPanelOrganize noHeader />
      </div>
      <SidebarContainer>
        <AIChatButton />
        <AppSidebarJournalButton />
        {sessionStatus === 'authenticated' && <NotificationButton />}
        <MenuItem
          data-testid="slider-bar-workspace-setting-button"
          icon={<SettingsIcon weight="duotone" />}
          onClick={onOpenSettingModal}
        >
          <span data-testid="settings-modal-trigger">
            {t['com.affine.settingSidebar.title']()}
          </span>
        </MenuItem>
      </SidebarContainer>
      <SidebarScrollableContainer>
        <NavigationPanelFavorites />
        <NavigationPanelMigrationFavorites />
        <NavigationPanelTags />
        <NavigationPanelCollections />
        <CollapsibleSection
          path={['others']}
          title={t['com.affine.rootAppSidebar.others']()}
          contentStyle={{ padding: '6px 8px 0 8px' }}
        >
          <TrashButton />
          <MenuItem
            data-testid="slider-bar-import-button"
            icon={<ImportIcon weight="duotone" />}
            onClick={onOpenImportModal}
          >
            <span data-testid="import-modal-trigger">{t['Import']()}</span>
          </MenuItem>
          <InviteMembersButton />
          <TemplateDocEntrance />
        </CollapsibleSection>
      </SidebarScrollableContainer>
      <SidebarContainer className={bottomContainer}>
        <SidebarAudioPlayer />
        {BUILD_CONFIG.isElectron ? <UpdaterButton /> : null}
      </SidebarContainer>
    </AppSidebar>
  );
});

RootAppSidebar.displayName = 'memo(RootAppSidebar)';
