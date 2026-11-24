import { permanentRedirect } from "next/navigation";

/** „В медиите“ now lives inside „Статии“. */
export default function MediaPage() {
  permanentRedirect("/statii?v=mediite");
}
