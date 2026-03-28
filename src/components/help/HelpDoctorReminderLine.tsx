import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const DOCTOR_GUIDE_PATH = "/sos?scenario=urgent_help";

type HelpDoctorReminderLineProps = {
  className?: string;
};

/**
 * Мягкая строка в конце ответа «Помощь маме» (без иконок и акцентного блока).
 * Ссылка ведёт в тему «Когда срочно обращаться к врачу?» (`urgent_help`).
 */
export function HelpDoctorReminderLine({ className }: HelpDoctorReminderLineProps) {
  return (
    <p
      className={cn(
        "text-xs font-normal leading-snug text-muted-foreground/85 mt-2",
        className
      )}
    >
      Если что-то вызывает беспокойство, можно посмотреть раздел{" "}
      <Link
        to={DOCTOR_GUIDE_PATH}
        className="underline underline-offset-2 text-muted-foreground/90 hover:text-foreground/90"
      >
        Когда обращаться к врачу
      </Link>{" "}
      или проконсультироваться со специалистом.
    </p>
  );
}
