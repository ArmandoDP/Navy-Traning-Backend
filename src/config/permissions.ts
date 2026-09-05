export type Role = 
  | 'director' 
  | 'finanzas' 
  | 'gerente' 
  | 'staff_navy' 
  | 'staff_galley'

export type ModuleName = 
  | 'dashboard'
  | 'checkin'
  | 'the_galley'
  | 'reservas'
  | 'clases'
  | 'sucursales'
  | 'clientes'
  | 'staff'
  | 'paquetes'
  | 'finanzas'
  | 'nomina'
  | 'alertas'
  | 'reportes'
  | 'integraciones'
  | 'configuracion'

/**
 * Matriz de Permisos del CRM (Basado en PERMISOS CRM.xlsx)
 * - director / finanzas: Acceso total
 * - gerente: Acceso operativo limitado a su sucursal
 * - staff_navy: Front Desk / Coach (Check-in, Reservas, Lectura de Clases/Clientes)
 * - staff_galley: Exclusivo operación The Galley
 */
export const MODULE_PERMISSIONS: Record<ModuleName, Role[]> = {
  dashboard:     ['director', 'finanzas', 'gerente'],
  checkin:       ['director', 'finanzas', 'gerente', 'staff_navy'],
  the_galley:    ['director', 'finanzas', 'staff_galley'],
  reservas:      ['director', 'finanzas', 'gerente', 'staff_navy'],
  clases:        ['director', 'finanzas', 'gerente', 'staff_navy'],
  sucursales:    ['director', 'finanzas', 'gerente'],
  clientes:      ['director', 'finanzas', 'gerente', 'staff_navy'],
  staff:         ['director', 'finanzas'],
  paquetes:      ['director', 'finanzas'],
  finanzas:      ['director', 'finanzas'],
  nomina:        ['director', 'finanzas'],
  alertas:       ['director', 'finanzas', 'gerente'],
  reportes:      ['director', 'finanzas', 'gerente'],
  integraciones: ['director', 'finanzas'],
  configuracion: ['director', 'finanzas'],
}