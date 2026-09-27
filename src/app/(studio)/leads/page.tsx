import { redirect } from "next/navigation";

export default function LeadsPage() {
  redirect("/clients?tab=leads");
}
