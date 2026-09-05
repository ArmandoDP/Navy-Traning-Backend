// Nombres de módulos
export type ModuleName = 
  | 'inicio'
  | 'clientes'
  | 'clases'
  | 'finanzas'
  | 'staff'
  | 'configuracion'

export type Module = ModuleName

// Roles del sistema
export type Role = 'Admin' | 'Manager' | 'Coach' | 'Staff' | 'FrontDesk' | string

// Matriz de permisos esperada por AuthContext
export const MODULE_PERMISSIONS: Record<ModuleName, Role[]> = {
  inicio:        ['Admin', 'Manager', 'Coach', 'Staff', 'FrontDesk'],
  clientes:      ['Admin', 'Manager', 'Coach', 'Staff', 'FrontDesk'],
  clases:        ['Admin', 'Manager', 'Coach', 'Staff', 'FrontDesk'],
  finanzas:      ['Admin', 'Manager'],
  staff:         ['Admin', 'Manager'],
  configuracion: ['Admin'],
}

// Alias por compatibilidad
export const PERMISSIONS = MODULE_PERMISSIONS

export function hasPermission(role: Role | null | undefined, module: ModuleName): boolean {
  if (!role) return false
  const allowedRoles = MODULE_PERMISSIONS[module]
  if (!allowedRoles) return false
  return allowedRoles.includes(role)
}