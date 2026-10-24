import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuPortal, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VaultAuthModal } from "@/components/user/vault-auth-modal";
import { Key, LogOut, Lock, Bell, Sparkles } from "lucide-react";
import { useSettingsStore, ToastPosition } from "@/lib/stores/settings-store";
import { ChangePassword } from "@/components/user/change-password";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ProfileButtonProps {
  /** 登出回调 */
  onLogout: () => void
  /** 额外的 CSS 类名 */
  className?: string
}

/**
 * ProfileButton - 用户资料按钮组件
 *
 * 圆形头像按钮，点击展开下拉菜单：
 * - 显示用户 ID
 * - 复制配置
 * - 登出
 */
export function ProfileButton({ onLogout, className }: ProfileButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configClient, setConfigClient] = useState<"obsidian" | "flowix">("obsidian")
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const { toastPosition, setToastPosition } = useSettingsStore()

  const currentUid = localStorage.getItem("uid")
  const username = localStorage.getItem("username")

  // 处理登出
  const handleLogout = () => {
    setOpen(false)
    onLogout()
  }

  // 复制配置到剪贴板
  const handleCopyConfig = (client: "obsidian" | "flowix" = "obsidian") => {
    setConfigClient(client)
    setConfigModalOpen(true)
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "size-9 rounded-full bg-muted flex items-center justify-center",
            "transition-all duration-200",
            "ring-2 ring-ring/30",
            "hover:ring-ring/50",
            "focus-visible:outline-none focus-visible:ring-ring",
            open && "ring-ring",
            className
          )}
          aria-label={t("ui.auth.userUid", { uid: currentUid })}
        >
          <span className="text-sm font-medium text-muted-foreground">
            {username?.charAt(0)?.toUpperCase() || currentUid?.charAt(0)?.toUpperCase() || "U"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-xl shadow-lg p-2"
        sideOffset={8}
      >
        {/* 用户头部信息 */}
        <div className="flex items-center gap-3 px-2 py-3 mb-2 bg-muted/30 rounded-lg">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg ring-2 ring-background shadow-sm">
            {username?.charAt(0)?.toUpperCase() || currentUid?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate">{username || t("ui.auth.unknownUser")}</span>
            <span className="text-xs text-muted-foreground truncate font-mono">UID: {currentUid}</span>
          </div>
        </div>

        <DropdownMenuSeparator className="-mx-2 mb-2" />
        

        <DropdownMenuGroup>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="rounded-lg">
              <Bell className="mr-2 size-4 text-muted-foreground" />
              <span>{t("ui.settings.toastPosition")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="rounded-xl">
                <DropdownMenuRadioGroup value={toastPosition} onValueChange={(value) => setToastPosition(value as ToastPosition)}>
                  {(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as ToastPosition[]).map((pos) => (
                    <DropdownMenuRadioItem key={pos} value={pos} className="rounded-lg cursor-pointer">
                      {t(`ui.settings.position.${pos}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuItem onClick={() => {
            setOpen(false);
            setChangePasswordOpen(true);
          }} className="rounded-lg cursor-pointer">
            <Lock className="mr-2 size-4 text-muted-foreground" />
            {t("ui.auth.changePassword")}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuGroup>

          {/* 复制配置 */}
          <DropdownMenuItem onClick={() => handleCopyConfig("obsidian")} className="rounded-lg cursor-pointer">
            <Key className="mr-2 size-4 text-muted-foreground" />
            {t("ui.vault.authTokenConfig")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCopyConfig("flowix")} className="rounded-lg cursor-pointer">
            <Sparkles className="mr-2 size-4 text-muted-foreground" />
            {t("ui.vault.authFlowixToken")}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-1" />

        {/* 登出 */}
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive rounded-lg cursor-pointer focus:bg-destructive/10"
        >
          <LogOut className="mr-2 size-4" />
          {t("ui.auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>

      {/* 配置模态窗口 */}
      <VaultAuthModal
        open={configModalOpen} 
        onOpenChange={setConfigModalOpen}
        client={configClient}
      />

      {/* 修改密码模态窗口 */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>{t("ui.auth.changePassword")}</DialogTitle>
          </DialogHeader>
          <ChangePassword close={() => setChangePasswordOpen(false)} />
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  )
}
