import { callNotebooklmMcp } from './mcpClient.js';

async function main() {
  const args = process.argv.slice(2);
  const url = args[0];
  const name = args[1] || 'Legislación Laboral Argentina';
  const description = args[2] || 'Fuentes normativas, LCT, CCTs, decretos y resoluciones para liquidación de haberes';

  if (!url) {
    console.log('❌ Uso: npm run notebook:add <URL_DE_NOTEBOOKLM> [NOMBRE] [DESCRIPCIÓN]');
    console.log('\nEjemplo:');
    console.log('npm run notebook:add "https://notebooklm.google.com/notebook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" "Legislación Laboral"');
    console.log('\n💡 Para obtener el link: En NotebookLM, hacé clic en Compartir (Share) -> Copiar enlace.');
    process.exit(1);
  }

  console.log(`📚 Registrando cuaderno: "${name}"...`);
  console.log(`🔗 URL: ${url}\n`);

  try {
    const addResult = await callNotebooklmMcp('add_notebook', {
      url,
      name,
      description,
      topics: ['legislación laboral', 'liquidación de sueldos', 'convenios colectivos', 'normativa argentina'],
      tags: ['sueldos', 'leyes', 'cct']
    }, 30000);

    const notebookId = addResult?.data?.notebook?.id || addResult?.notebook?.id || addResult?.data?.id;

    console.log('✅ Cuaderno añadido con éxito a la biblioteca local.');

    if (notebookId) {
      console.log(`📌 Seleccionando cuaderno como activo por defecto (ID: ${notebookId})...`);
      await callNotebooklmMcp('select_notebook', { id: notebookId }, 15000);
      console.log('🌟 ¡Cuaderno activado exitosamente!');
    }

    console.log('\nProbá hacer una consulta con:');
    console.log('npm run notebook:query "¿Qué establece la LCT sobre el período de prueba?"');
  } catch (error) {
    console.error('❌ Error registrando el cuaderno:', error.message);
    process.exit(1);
  }
}

main();
