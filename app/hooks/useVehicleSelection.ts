"use client";
import { useState } from "react";

export function useVehicleSelection(defaultModel: string | null = null) {
  const [selectedModel, setSelectedModel] = useState<string | null>(defaultModel);
  const [formVisible, setFormVisible] = useState(false);

  function selectAndScroll(name: string) {
    setSelectedModel(name);
    setFormVisible(true);
    setTimeout(() => {
      document.getElementById("booking-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  return { selectedModel, setSelectedModel, formVisible, setFormVisible, selectAndScroll };
}
