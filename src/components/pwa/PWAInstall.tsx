import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useSubscription } from "@/hooks/useSubscription";
import { PwaInstallSheet } from "@/components/pwa/PwaInstallSheet";
import { getInstallPromptDescription, PWA_INSTALL_TITLE } from "@/utils/pwaInstallCopy";

export function PWAInstall() {
  const { canInstall, promptInstall, showModal, dismissModal, isIOSDevice, installPromptTriggerSource } =
    usePWAInstall();
  const { hasAccess } = useSubscription();

  const description = getInstallPromptDescription(installPromptTriggerSource, hasAccess);

  return (
    <PwaInstallSheet
      open={showModal}
      onClose={() => dismissModal()}
      title={PWA_INSTALL_TITLE}
      description={description}
      isIOSDevice={isIOSDevice}
      canInstall={canInstall}
      onInstall={() => {
        promptInstall();
        dismissModal({ skipIncrement: true });
      }}
      variant="promo"
    />
  );
}
