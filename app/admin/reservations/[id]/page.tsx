"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReservationModal from "../../components/ReservationModal";

interface Vehicle {
  id: string;
  name: string;
  category: string;
  pricing_group: string;
  status: string;
}

export default function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch("/api/admin/vehicles").then((r) => r.json()).then(setVehicles);
  }, []);

  if (!open) return null;

  return (
    <ReservationModal
      reservationId={id}
      vehicles={vehicles}
      onClose={() => router.back()}
      onSaved={() => router.push("/admin/reservations")}
    />
  );
}
