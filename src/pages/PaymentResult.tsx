import { Link, useSearchParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

export function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("OrderId") ?? searchParams.get("order_id") ?? "";

  return (
    <MobileLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h1 className="text-typo-title font-semibold mb-2">Оплата прошла успешно</h1>
        <p className="text-muted-foreground mb-6">
          Подписка активирована. Обновите страницу или вернитесь в приложение, если статус не
          изменился.
        </p>
        {orderId && (
          <p className="text-typo-caption text-muted-foreground mb-4 font-mono">Заказ: {orderId}</p>
        )}
        <Button asChild>
          <Link to="/profile">В профиль</Link>
        </Button>
      </div>
    </MobileLayout>
  );
}

export function PaymentFail() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("OrderId") ?? searchParams.get("order_id") ?? "";

  return (
    <MobileLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <XCircle className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-typo-title font-semibold mb-2">Оплата не прошла</h1>
        <p className="text-muted-foreground mb-6">
          Попробуйте снова или выберите другой способ оплаты.
        </p>
        {orderId && (
          <p className="text-typo-caption text-muted-foreground mb-4 font-mono">Заказ: {orderId}</p>
        )}
        <Button asChild variant="outline">
          <Link to="/profile">В профиль</Link>
        </Button>
      </div>
    </MobileLayout>
  );
}
