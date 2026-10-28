/** Propose au navigateur d'enregistrer `data` dans un fichier JSON. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Libéré après le démarrage du téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
