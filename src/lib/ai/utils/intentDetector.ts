/**
 * Detección heurística ultrarrápida del lado del cliente para distinguir si
 * el usuario está intentando MODIFICAR/EDITAR elementos existentes o CREAR nuevos.
 * Se ejecuta en 0ms y sin costo de red ni de API.
 */

const EDIT_KEYWORDS = [
  // mover / desplazar / reubicar
  'mueve',
  'mover',
  'moví',
  'movi',
  'muevo',
  'moviendo',
  'desplaza',
  'desplazar',
  'desplacé',
  'desplace',
  'reubica',
  'reubicar',
  'reubiqué',
  'reubique',
  // cambiar / modificar / ajustar
  'cambia',
  'cambiar',
  'cambié',
  'cambie',
  'cambio',
  'cambiando',
  'modifica',
  'modificar',
  'modifiqué',
  'modifique',
  'ajusta',
  'ajustar',
  'ajusté',
  'ajuste',
  // pasar
  'pasa',
  'pasar',
  'pasé',
  'pase',
  'paso',
  'pasando',
  // poner
  'pon ',
  'poner',
  'puse',
  // hacer
  'haz ',
  'hacer',
  'hice',
  // eliminar / borrar / quitar
  'elimina',
  'eliminar',
  'eliminé',
  'elimine',
  'borra',
  'borrar',
  'borré',
  'borre',
  'quita',
  'quitar',
  'quité',
  'quite',
  // reprogramar / posponer / postergar / adelantar / atrasar
  'reprograma',
  'reprogramar',
  'reprogramé',
  'reprograme',
  'posterga',
  'postergar',
  'postergé',
  'postergue',
  'pospón',
  'pospon',
  'posponer',
  'pospuse',
  'adelanta',
  'adelantar',
  'adelanté',
  'adelante',
  'atrasa',
  'atrasar',
  'atrasé',
  'atrase',
  'actualiza',
  'actualizar',
  'actualicé',
  'actualice',
  'renombra',
  'renombrar',
  'renombré',
  'renombre',
  'archiva',
  'archivar',
  'archivé',
  'archive',
  'agrega a',
  'manda a',
];

export function detectIsEditIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return EDIT_KEYWORDS.some((kw) => lower.startsWith(kw) || lower.includes(` ${kw}`));
}
