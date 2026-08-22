function positiveCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function formatPmbEquipmentSummary(resources = {}) {
  const parts = [`${resources.pickupTrucks ?? 0} xe bán tải`];
  const companyVehicles = positiveCount(resources.companyVehicles);

  if (companyVehicles > 0) {
    parts.push(`${companyVehicles} xe công ty`);
  }

  parts.push(`${resources.measuringDevices ?? 0} máy đo`);
  parts.push(`${resources.weldingMachines ?? 0} máy hàn`);
  return parts.join(" + ");
}
