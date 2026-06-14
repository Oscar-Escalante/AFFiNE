# Connaxis Wiki — Change Migration Guide

**Base upstream commit:** `7123595831 chore: bump deps (#15059)`  
**Total Connaxis commits on top:** 76  
**Patch files:** `patches/` directory  
**Last updated:** 2026-06-14

This document describes every change made to the upstream AFFiNE codebase to produce Connaxis Wiki. Use this guide to reapply changes when upgrading to a newer upstream version.

---

## How to Reapply After an Upstream Upgrade

1. Find the new upstream base commit SHA
2. Apply patches from `patches/` (try `git am` or `git apply` first — many will apply cleanly)
3. For anything that conflicts, follow this guide section by section
4. Run `yarn install` and build to verify

---

## Category 1 — New Brand Package (`packages/brand/`)

**Status:** Entirely new — no conflicts expected.

Create the package from scratch. It provides `APP_NAME`, `SUPPORT_EMAIL`, `Logo`, `AppIcon`, `NavbarIcon` exports used throughout the frontend.

### `packages/brand/package.json`
```json
{
  "name": "@connaxis/brand",
  "version": "0.1.0",
  "main": "src/index.ts"
}
```

### `packages/brand/src/config.ts`
```ts
export const APP_NAME = 'Connaxis Wiki';
export const SUPPORT_EMAIL = 'oscar.escalante@connaxis.com';
```

### `packages/brand/src/index.ts`
Exports: `APP_NAME`, `SUPPORT_EMAIL`, `Logo`, `AppIcon`, `NavbarIcon`

### `packages/brand/src/logo.tsx`
React components: `Logo` (banner), `AppIcon` (square app icon), `NavbarIcon` (navbar icon)

### `packages/brand/assets/`
- `logo.svg` — SVG source
- `logo.png` — PNG for favicons
- `logo-banner.png` — Banner/wordmark
- `favicons/` — favicon-32, 36, 48, 72, 96, 144, 192.png + apple-touch-icon.png

### Registration in `package.json` (root)
Add to `workspaces` array: `"packages/brand"`.  
The `yarn.lock` entry for `@connaxis/brand` was also added.

---

## Category 2 — CI/CD Pipeline

### `.github/workflows/connaxis-build.yml` (NEW FILE)
Full GitHub Actions pipeline that:
1. `build-native` — Compiles Rust `server-native.x64.node` on ubuntu-22.04 with Rust 1.96.0 + clang
2. `build-frontend` — Runs `node_modules/.bin/affine bundle -p web` and `affine bundle -p admin`; sets version `0.26.3-connaxis`; `YARN_ENABLE_IMMUTABLE_INSTALLS=false`
3. `build-server` — TypeScript NestJS build; placeholder arm/armv7 `.node` files required
4. `build-and-push` — Assembles all artifacts, generates `favicon.ico` from `packages/brand/assets/logo.png` via Python/Pillow, builds Docker image, pushes to `ghcr.io/oscar-escalante/connaxis-wiki:canary`

Key env flags: `HUSKY=0`, `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, `SENTRYCLI_SKIP_DOWNLOAD=1`

**Trigger:** push to `canary` branch or `workflow_dispatch`

### `.github/deployment/node/Dockerfile`
```diff
+ ARG CACHE_BUST=unknown
  COPY ./packages/backend/server /app
  ...
+ RUN cp /app/static/favicon-192.png /app/static/favicon.ico
```
- Added `CACHE_BUST` ARG to force fresh layer on every build
- Overwrites `favicon.ico` with Connaxis PNG inside Docker (PNG is accepted by all modern browsers)

---

## Category 3 — Backend: Authentication

### `packages/backend/server/src/core/auth/config.ts`

| Setting | Upstream default | Connaxis default |
|---|---|---|
| `allowSignup` | `true` | `false` |
| `allowSignupForOauth` | `true` | `false` |
| `newAccountShareActionDelay` | `24 * 60 * 60` (1 day) | `0` |

All three now read from env vars (`AUTH_ALLOW_SIGNUP`, `AUTH_ALLOW_SIGNUP_FOR_OAUTH`, `AUTH_NEW_ACCOUNT_SHARE_ACTION_DELAY`).

**Why:** Connaxis is invite-only. New users cannot self-register; they must be invited by an admin.

### `packages/backend/server/src/plugins/oauth/service.ts`

When `allowSignupForOauth = false` (Connaxis default), instead of throwing `SignUpForbidden` for all OAuth attempts, the code now:
1. Looks up `existingUser` by email
2. If user doesn't exist or is disabled → throws `SignUpForbidden`
3. If user exists → creates the OAuth `connectedAccount` and returns the existing user

**Why:** Without this fix, invited members could not log in via Google OAuth — the guard rejected them even though they already existed in the system.

---

## Category 4 — Backend: Quota & Limits

### `packages/backend/server/src/core/quota/state.ts`

Two changes:
1. **Unlimited copilot for selfhosted:**
```diff
- unlimitedCopilot: entitlements.some(entitlement => entitlement.plan === 'ai'),
+ unlimitedCopilot: env.selfhosted || entitlements.some(entitlement => entitlement.plan === 'ai'),
```

2. **Seat limit override for selfhosted:**
```diff
- const seatLimit = quota.seatLimit ?? 0;
+ const seatLimit = env.selfhosted ? 150 : (quota.seatLimit ?? 0);
```

**Why:** All Connaxis users should have full AI access without needing an "AI" plan subscription. Seat limit hardcoded to 150 for the organization size.

### `packages/backend/server/src/models/common/feature.ts`

Changes to `FreeFeature.configs`:
| Field | Upstream | Connaxis |
|---|---|---|
| `blobLimit` | `10 * OneMB` | `0` (uploads disabled) |
| `businessBlobLimit` | `100 * OneMB` | `0` |
| `storageQuota` | `10 * OneGB` | `100 * OneGB` |
| `memberLimit` | `3` | `150` |

**Why:** File uploads disabled to keep storage manageable. Storage quota raised to 100 GB. Member limit raised for the organization.

---

## Category 5 — Backend: AI Prompts (`built-in.json`)

**File:** `packages/backend/native/src/llm/assets/prompts/built-in.json`

### Model Replacement
Every prompt that used `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.1-pro-preview`, `gemini-3.5-flash`, or `gpt-5-mini` was changed to `claude-sonnet-4-6`.

**Why:** Only Anthropic API key is configured on the Connaxis VPS. Google/OpenAI keys are not available.

### Chat Prompt Rename
```diff
- "name": "Chat With AFFiNE AI"
+ "name": "Chat With Connaxis AI"
```

### Optional/Pro Models
```diff
- "optionalModels": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.5-flash", "claude-sonnet-4-6"]
+ "optionalModels": ["claude-sonnet-4-6"]

- "proModels": ["gemini-2.5-pro", "gemini-3.5-flash", "claude-sonnet-4-6"]
+ "proModels": ["claude-sonnet-4-6"]
```

### System Prompt
Replaced the AFFiNE AI system prompt with:
```
You are Connaxis AI, a professional and helpful copilot within Connaxis.
You assist users with their knowledge management and collaboration tasks.
```
(Kept full citation format, tool-calling guidelines, interaction rules, formatting guidelines.)

### Intelligence Tab Note
The chat prompt includes `docSemanticSearch` in `config.tools`. This tool requires an embedding provider (`text-embedding-3-small` via OpenAI, or `gemini-embedding-001` via Google). Until an OpenAI key is added, the Intelligence tab will show `INTERNAL_SERVER_ERROR`.

**Fix when ready:**
1. Set `DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'` in `packages/backend/server/src/plugins/copilot/runtime/task-policy.ts`
2. Add `COPILOT_OPENAI_API_KEY=sk-...` to VPS Docker environment

---

## Category 6 — Backend: Doc Renderer

**File:** `packages/backend/server/src/core/doc-renderer/controller.ts`

```diff
- title = `${opts.title} | AFFiNE`  →  `${opts.title} | Connaxis Wiki`
- 'AFFiNE'  →  'Connaxis Wiki'
- href="/favicon.ico?v=2"  →  href="/favicon-192.png?v=3"
```

**Why:** Page titles and favicons must show Connaxis branding. Cache-busted to `v=3` to force browser reload.

---

## Category 7 — Frontend: Prompt Name References

These files must all use `'Chat With Connaxis AI'` (not `'Chat With AFFiNE AI'`):

| File | Change |
|---|---|
| `packages/frontend/core/src/modules/ai-button/services/models.ts:85` | `promptName = prompt \|\| 'Chat With Connaxis AI'` |
| `packages/frontend/core/src/blocksuite/ai/runtime/chat/session-strategy.ts` | 3 occurrences of `promptName: 'Chat With Connaxis AI'` |
| `packages/frontend/core/src/blocksuite/ai/runtime/request/action-definitions.ts` | `promptName: 'Chat With Connaxis AI'` |
| `packages/frontend/core/src/blocksuite/ai/provider/prompt.ts` | First entry in `promptKeys` array |

**Critical:** If these don't match the prompt name in `built-in.json`, the AI chat will fail with `COPILOT_PROMPT_NOT_FOUND`.

---

## Category 8 — Frontend: AI Component Branding

Text replacements from `'AFFiNE AI'` to `'Connaxis AI'`:

| File | Location |
|---|---|
| `src/blocksuite/ai/blocks/ai-chat-block/components/user-info.ts` | `userName: 'Connaxis AI'` |
| `src/blocksuite/ai/components/ai-chat-messages/ai-chat-messages.ts` | Loading state text |
| `src/blocksuite/ai/components/ai-message-content/assistant-avatar.ts` | Avatar label |
| `src/blocksuite/ai/components/playground/chat.ts` | Chat header |
| `src/blocksuite/ai/extensions/ai-slash-menu.ts` | Slash menu group names `1_Connaxis AI@N` |

### Error Messages
| File | Change |
|---|---|
| `src/blocksuite/ai/messages/error.ts` | Payment error → contact `oscar.escalante@connaxis.com`; Login error → "continue using Connaxis AI"; General error email → `oscar.escalante@connaxis.com` |
| `src/blocksuite/ai/widgets/ai-panel/components/state/error.ts` | Same contact email replacements |

---

## Category 9 — Frontend: Logo & Branding Components

All inline AFFiNE SVG logos replaced with imports from `@connaxis/brand`:

| File | Change |
|---|---|
| `packages/frontend/component/src/components/auth-components/logo.tsx` | `export { Logo } from '@connaxis/brand'` |
| `packages/frontend/component/src/components/auth-components/auth-header.tsx` | `Logo1Icon` → `NavbarIcon` from `@connaxis/brand` |
| `packages/frontend/component/src/components/affine-other-page-layout/layout.tsx` | `Logo1Icon` → `NavbarIcon`; removed download-app button, mobile/desktop navbars |
| `packages/frontend/core/src/components/affine/onboarding/assets/logo.tsx` | Removed 100-line SVG, replaced with `<AppIcon />` |
| `packages/frontend/admin/src/modules/accounts/components/logo.tsx` | Removed inline SVG, replaced with `<BrandLogo />` |
| `packages/frontend/admin/src/modules/setup/form.tsx` | "Welcome to AFFiNE" → "Welcome to Connaxis Wiki" |
| `packages/frontend/core/src/components/workspace-selector/user-with-workspace-list/index.tsx` | `Logo1Icon` → `AppIcon` |
| `packages/frontend/core/src/desktop/dialogs/setting/setting-sidebar/index.tsx` | `Logo1Icon` → `AppIcon` |
| `packages/frontend/core/src/desktop/components/document-title/index.tsx` | `'AFFiNE'` → `APP_NAME` from `@connaxis/brand` |

### Admin Setup SVG Logos
`packages/frontend/admin/src/modules/auth/logo.svg` and `packages/frontend/admin/src/modules/setup/logo.svg` replaced with Connaxis SVG.

---

## Category 10 — Frontend: Sidebar & Help Island

### Sidebar (`packages/frontend/core/src/components/root-app-sidebar/index.tsx`)
- Replaced BlockSuite icons with Phosphor Duotone: `Files`, `GearSix`, `ArrowSquareIn`, `Robot` (all `weight="duotone"`)
- Removed `AppDownloadButton` (not shown on web builds)
- Removed "Learn more" external link to AFFiNE blog/release notes

### Help Island (`packages/frontend/core/src/components/pure/help-island/index.tsx`)
- Removed "What's New" (changelog popup) item
- Removed "Contact Us" item
- Kept only Keyboard Shortcuts
- Changed tooltip from "Help & Feedback" → "Keyboard Shortcuts"

---

## Category 11 — Frontend: Settings Dialog

### General Settings (`desktop/dialogs/setting/general-setting/index.tsx`)
- Removed "About AFFiNE" tab (entire `AboutAffine` component and its import)

### Settings Modal (`desktop/dialogs/setting/index.tsx`)
- Removed footer with "Star AFFiNE on GitHub" / "Report Issue" feedback modals
- Removed `IssueFeedbackModal` and `StarAFFiNEModal` components

### License Page (`desktop/dialogs/setting/workspace-setting/license/index.tsx`)
- Removed `SelfHostTeamPlan` component
- Removed `TypeFormLink` component (Typeform purchase questionnaire)
- Kept: `SelfHostTeamCard`, `ReplaceLicenseModal`, `PaymentMethodUpdater`

---

## Category 12 — Frontend: Auth & Guards

### Sign-in Page (`components/sign-in/sign-in.tsx`)
- Removed terms & privacy policy links (shown only for non-selfhosted)
- Removed "Use without account" / "Add self-hosted" section for selfhosted

### Workspace Auth Guard (`desktop/pages/workspace/layouts/workspace-layout.tsx`)
Added `WorkspaceAuthGuard` component that redirects to sign-in if unauthenticated on web builds:
```ts
const isLocalWorkspaceAllowed = BUILD_CONFIG.isElectron || BUILD_CONFIG.isNative;
// On web: redirect if sessionStatus === 'unauthenticated'
```

### Open-in-App Banner (`modules/open-in-app/views/open-in-app-guard.tsx`)
```diff
- export const OpenInAppGuard = environment.isMobile ? Fragment : WebOpenInAppGuard;
+ export const OpenInAppGuard = Fragment;
```
Banner completely disabled.

### Editor Commands (`components/hooks/affine/use-register-blocksuite-editor-commands.tsx`)
Removed "Open in desktop app" command from the command palette.

### Doc Header Menu (`blocksuite/block-suite-header/menu/index.tsx`)
Removed "Open in desktop app" menu item.

---

## Category 13 — Frontend: Invite Link

### `packages/frontend/component/src/components/member-components/invite-team-modal/link-invite.tsx`
Major rewrite to fix race condition:
- Auto-generates an invite link (1 month expiry) on modal open via `useEffect` + `autoGeneratedRef`
- Uses local state (`localLink`) so link appears immediately without waiting for LiveData propagation
- Default expire time changed from `OneWeek` → `OneMonth`

### `packages/frontend/core/src/modules/share-setting/entities/share-setting.ts`
Added `setInviteLink(inviteLink)` method to allow direct state injection from the mutation result.

### `packages/frontend/core/src/desktop/dialogs/setting/workspace-setting/members/cloud-members-panel.tsx`
`onGenerateInviteLink` now calls `sharePreview.setInviteLink()` directly instead of relying on `revalidateInviteLink()`.

---

## Category 14 — Frontend: Onboarding & First App Data

### `packages/frontend/core/src/utils/first-app-data.ts`
Removed the "How to use folder and Tags" tutorial doc from the onboarding workspace (the doc was also removed from `onboarding.zip`).

### `packages/frontend/core/src/desktop/pages/index/index.tsx`
```diff
- buildShowcaseWorkspace(workspacesService, 'affine-cloud', 'AFFiNE Cloud')
+ buildShowcaseWorkspace(workspacesService, 'affine-cloud', 'Connaxis Wiki')
```

---

## Category 15 — Import Dialog

**File:** `packages/frontend/core/src/desktop/dialogs/import/index.tsx`
- Removed Discord links from import tip text, success status, and error status
- Removed "Feedback" button from error state (only "Retry" remains)

---

## Category 16 — HTML Templates & Manifest

### `tools/cli/src/rspack-shared/template.html`
```diff
- <title>AFFiNE</title>
+ <title>Connaxis Wiki</title>
- <link rel="shortcut icon" href="/favicon.ico?v=2" />
+ <link rel="shortcut icon" type="image/png" href="/favicon-192.png?v=3" />
```

### `packages/frontend/core/public/`
All favicon files replaced with Connaxis versions:
`favicon.ico`, `favicon-32/36/48/72/96/144/192.png`, `apple-touch-icon.png`

### `packages/frontend/core/public/manifest.json`
Updated app name to "Connaxis Wiki".

---

## Category 17 — i18n (All Locales)

**Files:** `packages/frontend/i18n/src/resources/*.json` (25 files: `en.json` + 24 translations)

All occurrences of `"AFFiNE"` replaced with `"Connaxis"` in string values (not keys).
Key replacements in `en.json`:
- `"AFFiNE Cloud"` → `"Connaxis Cloud"` 
- `"AFFiNE AI"` → `"Connaxis AI"`
- `"AFFiNE"` (standalone) → `"Connaxis"`
- Support email: `support@toeverything.info` → `oscar.escalante@connaxis.com`
- About AFFiNE title/subtitle → About Connaxis

**Note:** Non-English locales (ar, ca, da, de, es, fr, etc.) were also updated but may still contain untranslated Connaxis strings where the original was a proper noun.

---

## Category 18 — Workspace Card

**File:** `packages/frontend/core/src/components/workspace-selector/workspace-card/`
Custom workspace avatar: when a workspace has no custom avatar, falls back to Connaxis logo instead of auto-generated gradient avatar.

---

## Category 19 — Brand Theme CSS Override

**Patch file:** `patches/connaxis-theme.patch`

### New file: `packages/frontend/component/src/theme/connaxis.css`

Single CSS file that overrides `@toeverything/theme` variables. Imported last in `index.ts` so it takes precedence over all AFFiNE defaults. Light mode only — dark mode inherits AFFiNE defaults untouched.

**Import added to `packages/frontend/component/src/theme/index.ts`:**
```ts
import './connaxis.css'; // last — overrides everything above
```

**`tools/cli/src/rspack-shared/template.html`:**
```diff
- <meta name="theme-color" content="#fafafa" />
+ <meta name="theme-color" content="#f9fae4" />
```

### What the CSS overrides

**Typography — Lato from Google Fonts:**
```css
@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');
--affine-font-family: 'Lato', 'Inter', system-ui, ...;
```

**Primary accent — Connaxis Orange `#F09500`:**
Replaces the AFFiNE blue `#1E96EB` across all v1 and v2 CSS variables:
- `--affine-brand-color`, `--affine-primary-color`
- `--affine-v2-button-primary`
- `--affine-v2-database-focusBackground`
- `--affine-v2-aI-applyTextHighlight`
- `--affine-hover-color` (orange-tinted hover)
- Focus ring (`outline-color`), text selection (`::selection`)

**Heading scale — Navy vertical progression:**

| Level | Color | Hex |
|---|---|---|
| H1 | Navy-black (darkest) | `#0e1e38` |
| H2 | Very dark navy | `#12274a` |
| H3 | Dark navy | `#16305c` |
| H4–H6 | Connaxis Navy | `#1b3a6b` |

Applied via both standard HTML selectors and AFFiNE's editor block selectors:
```css
[data-block-is-heading='h1'] { color: #0e1e38 !important; }
[data-block-is-heading='h2'] { color: #12274a !important; }
[data-block-is-heading='h3'] { color: #16305c !important; }
```

**Sidebar active item — orange tint:**
```css
[data-active='true'] {
  background-color: rgba(240, 149, 0, 0.10) !important;
}
[data-active='true'] svg,
[data-active='true'] span {
  color: #f09500 !important;
}
```

### What was tried and reverted
- **Navy sidebar background** (`#1B3A6B`) — workspace avatar logos have white borders that show as lines on dark background; reverted
- **Warm cream backgrounds** (`#F9FAE4`) — too visually heavy/yellow; reverted
- Both reverted within the same CI cycle; only orange accent + typography survived

---

---

## Category 20 — Frontend: Rename AI Chat Tab (Intelligence → Knowledge)

**Commit:** `c7fc2a6167`

### `packages/frontend/i18n/src/resources/en.json`
```diff
- "com.affine.workspaceSubPath.chat": "Intelligence"
+ "com.affine.workspaceSubPath.chat": "Knowledge"
```

**Why:** "Intelligence" was the upstream AFFiNE label for the AI chat tab. "Knowledge" better fits the Connaxis context and brand voice.

---

## Category 21 — Frontend: Sidebar Navigation Restructure

**Commits:** `cec01fd7ec` through `1a54621ed2` (multiple iterations — see final state below)

### Overview of final sidebar layout

**Fixed top area:**
1. Search *(New Doc button removed)*
2. 📁 **Folders** — collapses/expands folder tree inline; clicking also navigates to All Docs (`/all`)
3. *(folder tree renders here when expanded — between Folders and Knowledge)*
4. 🧠 **Knowledge** (AI chat)
5. 📓 Journal
6. 🔔 Notifications
7. ⚙️ Settings

**Scrollable submenu:**
1. Favorites
2. Tags
3. Collections
4. Others (Trash, Import…)

**Removed entirely:** All Docs button, New Doc button from search area.

---

### Files changed

#### `packages/frontend/i18n/src/resources/en.json`
```diff
- "com.affine.rootAppSidebar.organize": "Organize"
+ "com.affine.rootAppSidebar.organize": "Folders"
```

---

#### `packages/frontend/core/src/components/root-app-sidebar/index.tsx`

Final structure:
```tsx
<AppSidebar>
  <SidebarContainer>
    {/* workspace nav + user info */}
    <div className={quickSearchAndNewPage}>
      <QuickSearchInput ... />
      {/* AddPageButton removed */}
    </div>
  </SidebarContainer>

  {/* folder tree section — flex: 0 1 auto, grows/shrinks between fixed areas */}
  <div className={folderTreeSection}>
    <NavigationPanelOrganize />
  </div>

  <SidebarContainer>
    <AIChatButton />           {/* Knowledge */}
    <AppSidebarJournalButton />
    <NotificationButton />
    <MenuItem icon={<SettingsIcon />} onClick={onOpenSettingModal}>Settings</MenuItem>
  </SidebarContainer>

  <SidebarScrollableContainer>
    <NavigationPanelFavorites />
    <NavigationPanelMigrationFavorites />
    <NavigationPanelTags />
    <NavigationPanelCollections />
    <CollapsibleSection path={['others']} ...>
      <TrashButton /><MenuItem import /><InviteMembersButton /><TemplateDocEntrance />
    </CollapsibleSection>
  </SidebarScrollableContainer>

  <SidebarContainer className={bottomContainer}>
    <SidebarAudioPlayer />
    {BUILD_CONFIG.isElectron ? <UpdaterButton /> : null}
  </SidebarContainer>
</AppSidebar>
```

Key removals: `AddPageButton`, `AllDocsButton`, `<NavigationPanelOrganize />` from ScrollableContainer.  
Key imports removed: `AddPageButton`, `AllDocsButton`, `AllDocsIcon`, `FolderNavIcon`, `NavigationPanelService`, `useMemo`.

---

#### `packages/frontend/core/src/components/root-app-sidebar/index.css.ts`

Added `folderTreeSection` — a flex child that sits between two `SidebarContainer` blocks and grows/shrinks with the tree without overflowing:

```ts
export const folderTreeSection = style({
  flex: '0 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 14px',
});
```

**Why:** `SidebarContainer` is `flex: 0 0 auto` (fixed height). Putting the folder tree inside it would overflow or push other items off-screen. This standalone div flexes to fit the tree content without affecting the fixed sidebar areas.

---

#### `packages/frontend/core/src/desktop/components/navigation-panel/sections/organize/index.tsx`

Complete rewrite. Uses its own `MenuItem` header (instead of `CollapsibleSection`) so it can:
- Render inline between two `SidebarContainer` blocks
- Show hover-replace arrow (requires `onCollapsedChange` on `MenuItem`)
- Navigate to `/all` AND toggle tree on click

Key changes:
- Uses **two separate collapse paths**: `['organize']` for subfolder node states, `['folders']` for the section's own visibility
- `WorkbenchService` imported and used: `workbench.openAll()` called in `onClick`
- All original features preserved: create folder (+), DnD, rename, subfolder operations

```tsx
import { WorkbenchService } from '@affine/core/modules/workbench';

const { organizeService, navigationPanelService, workbenchService } = useServices({
  OrganizeService, NavigationPanelService, WorkbenchService,
});
const workbench = workbenchService.workbench;

const path = useMemo(() => ['organize'], []);        // subfolder node states
const collapsePath = useMemo(() => ['folders'], []); // section visibility

return (
  <>
    <MenuItem
      icon={<FolderNavIcon weight="duotone" />}
      collapsed={collapsed}
      onCollapsedChange={handleCollapsedChange}
      onClick={() => {
        handleCollapsedChange(!collapsed);
        workbench.openAll();   // navigate to All Docs
      }}
      postfix={<IconButton onClick={handleCreateFolder}>...</IconButton>}
    >
      <span>{t['com.affine.rootAppSidebar.organize']()}</span>
    </MenuItem>
    {!collapsed && (
      <NavigationPanelTreeRoot ...>
        {folders.map(child => <NavigationPanelFolderNode ... />)}
      </NavigationPanelTreeRoot>
    )}
  </>
);
```

---

#### `packages/frontend/core/src/modules/navigation-panel/services/navigation-panel.ts`

```diff
  const DEFAULT_COLLAPSABLE_STATE: Record<string, boolean> = {
    recent: true,
    favorites: false,
    organize: false,
+   folders: true,   // Folders section starts collapsed
    collections: true,
    tags: true,
    favoritesOld: true,
    migrationFavorites: true,
    others: false,
  };
```

---

#### `packages/frontend/core/src/modules/app-sidebar/views/menu-item/index.css.ts`

Two changes for hover-replace arrow behavior and icon alignment:

**1. Icon hides on hover (replaced by arrow):**
```ts
export const icon = style({
  color: cssVarV2('icon/primary'),
  fontSize: '20px',
  transition: 'opacity 0.15s',
  selectors: {
    [`${root}:hover [data-collapsible="true"] > &`]: { opacity: 0 }, // hide when parent hovered
  },
});
```

**2. Arrow: absolutely positioned, left-aligned, hidden by default, shows on hover:**
```ts
export const collapsedIconContainer = style({
  width: '16px', height: '16px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '2px',
  position: 'absolute',
  left: 0,
  top: '50%',
  transform: 'translateY(-50%)',
  opacity: 0,                    // hidden by default
  transition: 'opacity 0.15s',
  selectors: {
    '&[data-disabled="true"]': { opacity: 0.3, pointerEvents: 'none' },
    '&:hover': { background: cssVarV2.layer.background.hoverOverlay },
    [`${root}:hover &`]: { opacity: 1 },  // show on parent hover
  },
});
```

**3. Left padding removed from collapsible items to fix icon alignment:**
```diff
  '&[data-collapsible="true"]': {
-   paddingLeft: '4px',
+   paddingLeft: '0px',
    paddingRight: '4px',
  },
```
**Why:** Other sidebar items (Journal, Knowledge, Settings) have `paddingLeft: 0`. The collapsible Folders item was shifted 4px right relative to them, causing visible misalignment.

---

#### `packages/frontend/core/src/modules/app-sidebar/views/category-divider/index.tsx`
```diff
- label: string;
+ label: ReactNode;   // + ReactNode import added
```

#### `packages/frontend/core/src/desktop/components/navigation-panel/layouts/collapsible-section.tsx`
```diff
+ icon?: ReactNode;   // optional prop, passes <>{icon}{title}</> as label to CategoryDivider
```

*(These two changes were part of an intermediate approach and are still present in the codebase, though no longer used by the Folders section.)*

---

## Category 22 — Infrastructure: Google Sheets → AFFiNE Wiki Sync

**Location:** `packages/brand/google-sync/` (local) → deployed to `/home/sshadmin/apps/affine/google-sync/` on VPS

This is a standalone Python sync script — **not part of the AFFiNE frontend/backend build**. It runs as a cron job on the VPS and writes directly to the AFFiNE PostgreSQL database.

### What it does
Reads a Google Sheet via the Sheets API (service account auth) and overwrites the Y.js snapshot of a designated AFFiNE wiki page with fresh content. Runs every 30 minutes via cron.

### Files

#### `packages/brand/google-sync/sync_sheet.py`
Main script. Key functions:
- `read_sheet()` — reads Google Sheet using `gspread` + service account JSON
- `build_doc(title, records)` — generates a complete AFFiNE Y.js document binary using `pycrdt`:
  - Creates `affine:page` → `affine:surface` + `affine:note` → `affine:paragraph` + `affine:divider` blocks
  - First column of each row → `h3` heading; remaining columns → `"Campo: Valor"` text lines
  - Skips empty column names and empty/zero values
  - Prepends an auto-updated timestamp line
- `update_affine_doc()` — upserts into `snapshots` table, deletes stale `updates` rows

#### `packages/brand/google-sync/requirements.txt`
```
gspread>=6.0.0
google-auth>=2.0.0
psycopg2-binary>=2.9.0
pycrdt>=0.9.0
```

#### `packages/brand/google-sync/.env.example`
Config template (real `.env` lives only on VPS at `/home/sshadmin/apps/affine/google-sync/.env`):
```env
GOOGLE_SERVICE_ACCOUNT_FILE=/home/sshadmin/apps/affine/google-sync/service-account.json
GOOGLE_SHEET_ID=12yW_zV35vz5W8s9vyErX8_-Wos2m7q0OaTPpKWH1DGQ
GOOGLE_SHEET_TAB=Working groups
AFFINE_WORKSPACE_ID=35a3579b-3f97-4813-b3d1-c9b8a8546cee
AFFINE_DOC_ID=wr5nqDpS7kj-jafgnd6fk
AFFINE_DOC_TITLE=Working Groups
AFFINE_DB_URL=postgresql://affine_sync:...@127.0.0.1:5432/affine
```

#### `packages/brand/google-sync/setup.sh`
One-time VPS setup: creates venv, installs deps, creates `affine_sync` PostgreSQL user with write access to `snapshots`, `updates`, `workspaces`, `workspace_admin_stats_dirty`, and registers cron job.

### VPS state after setup
- **Venv:** `/home/sshadmin/apps/affine/google-sync/venv/`
- **Service account JSON:** `/home/sshadmin/apps/affine/google-sync/service-account.json` (permissions 600)
- **Cron:** `*/30 * * * *` — runs as `sshadmin`, sources `.env`, logs to `sync.log`
- **DB user:** `affine_sync` — GRANT SELECT/INSERT/UPDATE/DELETE on `snapshots`; DELETE on `updates`; SELECT on `workspaces` and `workspace_admin_stats_dirty`

### Google Sheets setup
- **Service account:** `wiki-connaxis@wiki-connaxis.iam.gserviceaccount.com`
- **Sheet shared with service account** as Viewer
- **Google Sheets API** enabled in project `wiki-connaxis` (project id `256075906422`)

### Current sync target
| Field | Value |
|---|---|
| Sheet | Working groups tab of the Connaxis contacts spreadsheet |
| Wiki page | `wr5nqDpS7kj-jafgnd6fk` (Working Groups page) |
| Workspace | `35a3579b-3f97-4813-b3d1-c9b8a8546cee` |

### To add a new sheet sync
1. Copy `.env.example` on VPS, set the new `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB`, `AFFINE_DOC_ID`, `AFFINE_DOC_TITLE`
2. Share the new sheet with `wiki-connaxis@wiki-connaxis.iam.gserviceaccount.com`
3. Add a new cron entry pointing to the script with the new env file

---

## Pending / Future Work

### Knowledge Tab (docSemanticSearch)
**Status:** Non-functional — needs embedding API key. (Previously called "Intelligence Tab")

To enable:
1. In `packages/backend/server/src/plugins/copilot/runtime/task-policy.ts`:
   ```ts
   export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'; // was 'gemini-embedding-001'
   ```
2. Add to VPS Docker environment: `COPILOT_OPENAI_API_KEY=sk-...`

### GitHub Repository Privacy
To make the Docker image private:
1. Add `docker login ghcr.io` step with PAT to `connaxis-build.yml`
2. Make the GitHub repo private in settings

---

## File Change Summary

### New Files
- `.github/workflows/connaxis-build.yml`
- `packages/brand/` (entire package)
- `packages/brand/google-sync/` (VPS sync script — not part of AFFiNE build)
- `packages/frontend/component/src/theme/connaxis.css` (brand theme override)

### Binary Files Changed
- `packages/brand/assets/` — logo files
- `packages/frontend/core/public/` — all favicon files
- `packages/frontend/templates/onboarding/onboarding.zip` — removed folder/tags tutorial

### Key Backend Files
- `packages/backend/native/src/llm/assets/prompts/built-in.json`
- `packages/backend/server/src/core/auth/config.ts`
- `packages/backend/server/src/core/doc-renderer/controller.ts`
- `packages/backend/server/src/core/quota/state.ts`
- `packages/backend/server/src/models/common/feature.ts`
- `packages/backend/server/src/plugins/oauth/service.ts`
- `.github/deployment/node/Dockerfile`

### Key Frontend Files (~34 files)
Most in `packages/frontend/core/src/` under: `blocksuite/ai/`, `components/`, `desktop/dialogs/`, `desktop/pages/`, `modules/`

Notable sidebar files (Categories 20–21):
- `packages/frontend/core/src/components/root-app-sidebar/index.tsx`
- `packages/frontend/core/src/components/root-app-sidebar/index.css.ts`
- `packages/frontend/core/src/desktop/components/navigation-panel/layouts/collapsible-section.tsx`
- `packages/frontend/core/src/desktop/components/navigation-panel/sections/organize/index.tsx`
- `packages/frontend/core/src/modules/app-sidebar/views/category-divider/index.tsx`
- `packages/frontend/core/src/modules/app-sidebar/views/menu-item/index.css.ts`
- `packages/frontend/core/src/modules/navigation-panel/services/navigation-panel.ts`

### i18n Files (25 files)
All locale files in `packages/frontend/i18n/src/resources/`

Notable i18n changes (post-initial pass):
- `"com.affine.workspaceSubPath.chat"`: `"Intelligence"` → `"Knowledge"`
- `"com.affine.rootAppSidebar.organize"`: `"Organize"` → `"Folders"`
