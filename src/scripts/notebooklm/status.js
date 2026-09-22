import { callNotebooklmMcp } from './mcpClient.js';

async function main() {
  console.log('🔍 Consultando estado del servicio MCP NotebookLM / Gemini Notebook...\n');

  try {
    const health = await callNotebooklmMcp('get_health', {}, 15000);
    const library = await callNotebooklmMcp('list_notebooks', {}, 15000);

    console.log('====================================================');
    console.log('           ESTADO DEL SERVICIO MCP NOTEBOOKLM       ');
    console.log('====================================================');
    console.log(`Estado:            ${health?.data?.status || 'desconocido'}`);
    console.log(`Autenticado:       ${health?.data?.authenticated ? '✅ SÍ' : '❌ NO (ejecutar: npm run notebook:auth)'}`);
    console.log(`Cuaderno Activo:   ${health?.data?.active_notebook_name || 'Ninguno seleccionado'}`);
    console.log(`Total Cuadernos:   ${health?.data?.total_notebooks ?? 0}`);
    console.log(`Sesiones Activas:  ${health?.data?.active_sessions ?? 0}`);
    console.log('====================================================\n');

    const notebooksList = library?.data?.notebooks || library?.notebooks || [];
    if (notebooksList.length > 0) {
      console.log('📚 Cuadernos Registrados en la Biblioteca:');
      notebooksList.forEach((nb, i) => {
        const isActive = nb.id === health?.data?.active_notebook_id;
        console.log(` ${i + 1}. [${isActive ? 'ACTIVO' : ' '}] ${nb.name || 'Sin título'} (ID: ${nb.id})`);
        if (nb.url) console.log(`    URL:  ${nb.url}`);
        if (nb.description) console.log(`    Desc: ${nb.description}`);
      });
    } else {
      console.log('ℹ️  No hay cuadernos registrados todavía.');
      console.log('   Para registrar tu cuaderno de legislación laboral argentina:');
      console.log('   npm run notebook:add <URL_COMPARTIDA_NOTEBOOKLM> "Legislación Laboral"');
    }
  } catch (error) {
    console.error('❌ Error al consultar el servidor MCP:', error.message);
    process.exit(1);
  }
}

main();
