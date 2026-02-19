import { useParams, useNavigate, useLayoutEffect } from "react-router-dom";
import { getSosTopicConfig } from "@/data/sosTopics";

/**
 * Прямые ссылки /sos/topic/:topicId перенаправляют на /sos?scenario=topicId,
 * чтобы открылся bottom sheet консультации по теме (без общего Help-чата).
 */
export default function SosTopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const topic = topicId ? getSosTopicConfig(topicId) : null;

  useLayoutEffect(() => {
    if (!topicId) {
      navigate("/sos", { replace: true });
      return;
    }
    navigate(`/sos?scenario=${encodeURIComponent(topicId)}`, { replace: true });
  }, [topicId, navigate]);

  return null;
}
