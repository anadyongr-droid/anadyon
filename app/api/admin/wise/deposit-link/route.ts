import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildWiseDepositLink } from "@/lib/wise";
import QRCode from "qrcode";

// POST /api/admin/wise/deposit-link  { reservationId }
// Admin-only via proxy.ts.
export async function POST(req: NextRequest) {
  const handle = process.env.WISE_BUSINESS_HANDLE;
  if (!handle) {
    return NextResponse.json(
      { error: "WISE_BUSINESS_HANDLE is not set. Add it in Vercel — it is the name in your Wise pay link." },
      { status: 400 }
    );
  }

  const { reservationId } = await req.json();
  if (!reservationId) return NextResponse.json({ error: "Missing reservationId" }, { status: 400 });

  const { data: res, error } = await supabaseAdmin
    .from("reservations")
    .select("id, customer_name, deposit, notes")
    .eq("id", reservationId)
    .single();

  if (error || !res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const deposit = Number(res.deposit);
  if (!Number.isFinite(deposit) || deposit <= 0) {
    return NextResponse.json({ error: "No deposit amount on this reservation" }, { status: 400 });
  }

  const link = buildWiseDepositLink({ handle, reservationId: res.id, amount: deposit, notes: res.notes });

  // Rendered server-side so the client bundle stays untouched. A data URI is
  // fine here: the CSP allows img-src data:, and it lets the QR be shown or
  // screenshotted straight from the reservation without hosting a file.
  let qr: string | null = null;
  try {
    qr = await QRCode.toDataURL(link.url, { width: 320, margin: 1, errorCorrectionLevel: "M" });
  } catch (err) {
    console.error("Wise QR generation failed", err);
  }

  return NextResponse.json({ ...link, qr });
}
