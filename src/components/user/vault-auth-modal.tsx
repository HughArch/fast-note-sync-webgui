import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTokenHandle } from "@/components/api-handle/token-handle";
import { Clipboard, ExternalLink, Loader2, Key, X, Check } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { toast } from "@/components/common/Toast";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import env from "@/env.ts";
import { Textarea } from "../ui/textarea";

interface VaultAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultName?: string;
  client?: "obsidian" | "flowix";
  onSuccess?: () => void;
}

export function VaultAuthModal({ open, onOpenChange, vaultName, client = "obsidian", onSuccess }: VaultAuthModalProps) {
  const { t } = useTranslation();
  const isFlowix = client === "flowix";
  const defaultPreset = t("ui.obsidian.presetWin", "我的Win")
  const { handleCreateToken, isLoading } = useTokenHandle();
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>(defaultPreset);
  const [customNote, setCustomNote] = useState("");
  const [flowixNote, setFlowixNote] = useState("");
  const [limitVault, setLimitVault] = useState(true);

  const defaultFlowixNote = vaultName ? `Flowix - ${vaultName}` : "Flowix";

  // Reset generated token and fields when modal closes
  useEffect(() => {
    if (!open) {
      setGeneratedToken(null);
      setSelectedPreset(defaultPreset);
      setCustomNote("");
      setFlowixNote("");
      setLimitVault(true);
    } else if (isFlowix) {
      setFlowixNote(defaultFlowixNote);
    }
  }, [open, defaultPreset, isFlowix, defaultFlowixNote]);

  const onGenerate = async () => {
    // Generate a token for the target client with rest and ws scopes
    const vaultsParam = (vaultName && limitVault) ? vaultName : undefined;
    const finalNote = isFlowix
      ? (flowixNote.trim() || defaultFlowixNote)
      : (selectedPreset === "custom" ? customNote.trim() : selectedPreset);
    const clientParam = finalNote || (vaultName ? `Obsidian - ${vaultName}` : "Obsidian");

    // clientType (1st arg) represents the User-defined Title/Remark shown in WebGUI cards.
    // client (7th arg) strictly restricts token usage to the target client id.
    const token = await handleCreateToken(
      clientParam, // clientType (Remark/Title)
      "rest,ws", // scope (legacy)
      365, // expiredDays
      undefined, // boundIp
      undefined, // userAgent
      "rest,ws", // protocol
      isFlowix ? "flowix" : "ObsidianPlugin", // client (Strict Client Restriction)
      undefined, // functionScope
      vaultsParam // vaults
    );
    if (token) {
      setGeneratedToken(token);
      toast.success(t("ui.common.success", "操作成功"));
      onSuccess?.();
    } else {
      toast.error(t("ui.common.error", "操作失败"));
    }
  };

  const getConfigJson = useCallback(() => {
    return JSON.stringify({
      api: env.API_URL,
      apiToken: generatedToken || "",
      ...(vaultName ? { vault: vaultName } : {}),
    }, null, 2);
  }, [generatedToken, vaultName]);

  const getObsidianUrl = useCallback(() => {
    if (!generatedToken) return "";
    const api = env.API_URL;
    const vault = vaultName || "";
    return `obsidian://fast-note-sync/sso?pushApi=${encodeURIComponent(api)}&pushApiToken=${encodeURIComponent(generatedToken)}&pushVault=${encodeURIComponent(vault)}`;
  }, [generatedToken, vaultName]);

  const handleCopyConfig = () => {
    const configText = getConfigJson();
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(configText)
        .then(() => {
          toast.success(t("ui.vault.copyConfigSuccess", "配置已复制到剪贴板"));
        })
        .catch((err) => {
          toast.error(t("ui.common.error", "操作失败：") + err);
        });
    } else {
      toast.error(t("ui.vault.copyConfigError", "复制失败，请手动选择复制"));
    }
  };

  const handleCopyToken = () => {
    if (!generatedToken) return;
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(generatedToken)
        .then(() => {
          toast.success(t("ui.obsidian.copyTokenSuccess", "令牌已复制到剪贴板"));
        })
        .catch((err) => {
          toast.error(t("ui.common.error", "操作失败：") + err);
        });
    } else {
      toast.error(t("ui.vault.copyConfigError", "复制失败，请手动选择复制"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto rounded-2xl border-border bg-background shadow-2xl p-5 gap-2 sm:gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2 text-foreground">
            <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
              <Key className="h-4 w-4 text-primary" />
            </div>
            {isFlowix ? t("ui.vault.authFlowixToken", "授权 Flowix") : t("ui.vault.authTokenConfig", "授权 Obsidian")}
            {vaultName && (
              <span className="text-xs sm:text-sm text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full ml-1.5 truncate max-w-[120px] sm:max-w-[200px]">
                {vaultName}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/80 mt-1">
            {isFlowix
              ? t("ui.flowix.generateTokenDesc", "为 Flowix 桌面端生成一个具有完整同步权限 (REST + WebSocket) 的专用授权令牌，客户端维度固定为 c:flowix。")
              : t("ui.obsidian.generateTokenDesc", "为 Obsidian 插件生成一个具有完整同步权限 (REST + WebSocket) 的专用授权令牌。")}
          </DialogDescription>
        </DialogHeader>

        {!generatedToken ? (
          <div className="relative w-full flex flex-col items-center justify-center p-6 sm:p-7 border border-border/80 rounded-2xl bg-card shadow-sm overflow-hidden transition-all duration-300">
            {/* Elegant Radial Glow Backdrops */}
            <div className="absolute -top-16 -right-16 w-36 h-36 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-primary/5 blur-3xl rounded-full pointer-events-none" />

            {/* Glowing Double-Ring Key Icon Badge */}
            <div className="relative flex items-center justify-center mb-3">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-md animate-pulse pointer-events-none" />
              <div className="relative p-3 bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20 rounded-full shadow-inner">
                <Key className="h-6 w-6 text-primary animate-in spin-in-12 duration-500" />
              </div>
            </div>

            {/* Title & Desc */}
            <div className="text-center space-y-1 mb-5">
              <h3 className="font-bold text-sm tracking-tight text-foreground">
                {isFlowix
                  ? t("ui.flowix.tokenRequired", "自动生成 Flowix 授权令牌")
                  : t("ui.obsidian.tokenRequired", "自动生成授权令牌")}
              </h3>
              <p className="text-[11px] text-muted-foreground/90 mx-auto leading-relaxed">
                {isFlowix
                  ? t("ui.flowix.tokenPrompt", "点击下方按钮生成一个专用令牌，并绑定当前笔记库。生成后可在 Flowix 中直接使用。")
                  : t("ui.obsidian.tokenPrompt", "点击下方按钮生成一个专用的授权令牌，用于在 Obsidian 中进行同步, 服务端不会保存令牌。")}
              </p>
            </div>

            {/* Form Fields & Remark Selection */}
            <div className="min-w-45 space-y-3 z-10">
              <div className="space-y-1 w-full">
                <Label className="text-[10px] font-semibold tracking-wider text-muted-foreground/75 uppercase text-center block w-full">
                  {isFlowix ? t("ui.flowix.remark", "令牌备注") : t("ui.obsidian.remark", "令牌备注")}
                </Label>

                {isFlowix ? (
                  <Input
                    id="flowixNote"
                    placeholder={t("ui.flowix.remarkPlaceholder", "输入备注...")}
                    value={flowixNote}
                    onChange={(e) => setFlowixNote(e.target.value)}
                    className="h-8 px-3 py-1 text-xs rounded-lg bg-background border-border/60 text-center min-h-0 w-full shadow-sm"
                  />
                ) : selectedPreset !== "custom" ? (
                  <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                    <SelectTrigger className="h-8 text-xs rounded-lg bg-background border-border/60 hover:border-border min-h-0 px-3 py-1 flex items-center justify-between w-full shadow-sm transition-all">
                      <SelectValue placeholder={t("ui.obsidian.remark", "令牌备注")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value= {t("ui.obsidian.presetWin", "我的Win")} className="text-xs">
                        {t("ui.obsidian.presetWin", "我的Win")}
                      </SelectItem>
                      <SelectItem value={t("ui.obsidian.presetMac", "我的Mac")} className="text-xs">
                        {t("ui.obsidian.presetMac", "我的Mac")}
                      </SelectItem>
                      <SelectItem value={t("ui.obsidian.presetPhone", "我的手机")} className="text-xs">
                        {t("ui.obsidian.presetPhone", "我的手机")}
                      </SelectItem>
                      <SelectItem value={t("ui.obsidian.presetTablet", "我的平板")} className="text-xs">
                        {t("ui.obsidian.presetTablet", "我的平板")}
                      </SelectItem>
                      <SelectItem value={t("ui.obsidian.presetAndroid", "我的安卓")} className="text-xs">
                        {t("ui.obsidian.presetAndroid", "我的安卓")}
                      </SelectItem>
                      <SelectItem value="custom" className="text-xs font-semibold text-primary">
                        {t("ui.obsidian.presetCustom", "自定义...")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="relative flex items-center w-full animate-in fade-in zoom-in-95 duration-200">
                    <Input
                      id="clientNote"
                      placeholder={t("ui.obsidian.remarkPlaceholder", "输入自定义备注...")}
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      className="h-8 pl-3 pr-8 py-1 text-xs rounded-lg bg-background border-border/60 text-center min-h-0 w-full shadow-sm"
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 h-6 w-6 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 min-h-0"
                      onClick={() => {
                        setSelectedPreset("我的Win"); // Reset back to dropdown
                        setCustomNote("");
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* 是否限制笔记库 Checkbox */}
              {vaultName && (
                <div className="flex items-center justify-center space-x-1.5 w-full py-0.5">
                  <Checkbox
                    id="limitVault"
                    checked={limitVault}
                    onCheckedChange={(checked) => setLimitVault(checked === true)}
                    className="size-3.5 shrink-0 border-border/70 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <Label htmlFor="limitVault" className="text-[10.5px] font-medium cursor-pointer select-none truncate text-muted-foreground hover:text-foreground transition-colors">
                    {t("ui.obsidian.limitToCurrentVault", "仅限当前笔记库")}
                  </Label>
                </div>
              )}
            </div>

            {/* Action Button */}
            <Button
              onClick={onGenerate}
              disabled={isLoading}
              className="rounded-xl h-9 min-w-45 text-xs font-bold bg-linear-to-r from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.03] active:scale-[0.97] transition-all flex items-center justify-center mt-5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {t("ui.obsidian.generating", "正在生成...")}
                </>
              ) : (
                <>
                  <Key className="h-3.5 w-3.5 mr-1.5" />
                  {isFlowix
                    ? t("ui.flowix.generateToken", "生成并授权")
                    : t("ui.obsidian.generateToken", "生成并授权")}
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-3 duration-300">
            {/* Header Success Ring & Celebration Banner */}
            <div className="flex flex-col items-center text-center space-y-1.5 py-1">
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md animate-ping duration-1000 pointer-events-none" />
                <div className="relative p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <Check className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
              <h3 className="font-bold text-sm text-emerald-500">
                {isFlowix
                  ? t("ui.flowix.authSuccess", "已成功生成 Flowix 授权令牌！")
                  : t("ui.obsidian.authSuccess", "已成功生成授权令牌！")}
              </h3>
              <p className="text-[10.5px] text-muted-foreground max-w-xs leading-normal">
                {isFlowix
                  ? t("ui.flowix.importPrompt", "请将以下配置填入 Flowix 客户端的笔记本绑定信息中：")
                  : t("ui.obsidian.importPrompt", "为了将笔记同步到该客户端，请选择以下任一方式完成配置：")}
              </p>
            </div>

            {/* Config Mode Option Cards */}
            {isFlowix ? (
              <div className="border border-primary/20 bg-primary/5 rounded-xl p-3 sm:p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-primary">
                    {t("ui.flowix.configTitle", "配置信息")}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-background border-border/50 gap-1 px-2.5 shadow-sm"
                    onClick={handleCopyConfig}
                  >
                    <Clipboard className="h-3 w-3" />
                    {t("ui.vault.copyConfig", "复制 JSON")}
                  </Button>
                </div>
                <div className="relative group">
                  <Textarea readOnly className="p-3 rounded-lg bg-background text-[10px]! sm:text-xs! min-h-52 font-mono whitespace-pre-wrap border border-border/60 text-muted-foreground/85">
                    {getConfigJson()}
                  </Textarea>
                </div>
                <p className="text-[10px] text-muted-foreground/90 leading-relaxed">
                  {t("ui.flowix.configHint", "在 Flowix 中新建笔记本，选择该笔记库并粘贴 apiToken 即可开始同步。")}
                </p>
              </div>
            ) : (
            <div className="space-y-3">
              {/* Method 1: Automatic One-Click SSO Config (Recommended) */}
              <div
                onClick={() => { window.location.href = getObsidianUrl(); }}
                className="border border-primary/20 bg-primary/5 hover:bg-primary/10 rounded-xl p-3 sm:p-4 transition-all duration-200 space-y-2 group cursor-pointer shadow-sm hover:shadow-md"
              >
                <div className="space-y-0.5 text-left min-w-0 pr-3">
                  <h4 className="font-bold text-xs text-primary flex items-center gap-1.5">
                    {t("ui.obsidian.methodOne", "方式一：一键自动导入")}
                    <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">
                      {t("ui.common.recommended", "推荐")}
                    </span>
                  </h4>
                  <p className="text-[10px] text-muted-foreground/90 truncate leading-relaxed">
                    {t("ui.obsidian.oneClickSSOPrompt", "无需手动复制，一键自动拉起并配置 Obsidian 插件")}
                  </p>
                </div>
                <Button size="sm" className="h-7 text-[10px] rounded-lg shrink-0 gap-1 font-bold group-hover:scale-105 active:scale-95 transition-all">
                  <ExternalLink className="h-3 w-3" />
                  {t("ui.obsidian.oneClickImport", "立即配置")}
                </Button>
              </div>

              {/* Method 2: Manual Config Copy */}
              <div className="border border-border bg-muted/30 rounded-xl p-3 sm:p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground/80">
                    {t("ui.obsidian.methodTwo", "方式二：手动复制 JSON 信息")}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-background border-border/50 gap-1 px-2.5 shadow-sm"
                    onClick={handleCopyConfig}
                  >
                    <Clipboard className="h-3 w-3" />
                    {t("ui.vault.copyConfig", "复制 JSON")}
                  </Button>
                </div>
                  <div className="relative group">
                    <Textarea readOnly className="p-3 rounded-lg bg-background text-[10px]! sm:text-xs! min-h-52 font-mono whitespace-pre-wrap border border-border/60 text-muted-foreground/85">
                      {getConfigJson()}
                    </Textarea>
                </div>
              </div>
            </div>
            )}

            {/* Bottom Controls */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={handleCopyToken}
                className="group rounded-xl h-8 text-xs font-semibold px-4 border-border/50 gap-1.5"
              >
                <Clipboard className="h-3.5 w-3.5 text-muted-foreground/80 group-hover:text-accent-foreground transition-colors" />
                {t("ui.obsidian.copyToken", "复制令牌")}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl h-8 text-xs font-semibold px-4 border-border/50"
              >
                {t("ui.common.close", "关闭")}
              </Button>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
