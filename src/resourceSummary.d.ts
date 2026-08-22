export interface PmbEquipmentResources {
  pickupTrucks?: unknown;
  companyVehicles?: unknown;
  measuringDevices?: unknown;
  weldingMachines?: unknown;
}

export function formatPmbEquipmentSummary(resources?: PmbEquipmentResources): string;
