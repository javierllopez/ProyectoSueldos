import { callNotebooklmMcp } from './mcpClient.js';

async function main() {
  console.log('🚀 Iniciando proceso de autenticación con Google NotebookLM / Gemini Notebook...\n');
  console.log('📌 INSTRUCCIONES:');
  console.log('1. Se abrirá una ventana de Google Chrome.');
  console.log('2. Iniciá sesión con la cuenta de Google que tiene acceso a tu cuaderno.');
  console.log('3. Al completar el inicio de sesión y acceder a NotebookLM, la ventana se cerrará automáticamente.');
  console.log('4. Las credenciales y sesión quedarán guardadas permanentemente para que Antigravity pueda consultar tu cuaderno.\n');
  console.log('⏳ Abriendo navegador y esperando tu inicio de sesión (tiempo límite: 10 minutos)...\n');

  try {
    const result = await callNotebooklmMcp('setup_auth', { show_browser: true }, 600000);
    console.log('\n====================================================');
    console.log('🎉 ¡AUTENTICACIÓN COMPLETADA EXITOSAMENTE!');
    console.log('====================================================');
    console.log(result?.data?.message || 'Sesión y cookies guardadas.');
    console.log('\nYa podés agregar tu cuaderno ejecutando:');
    console.log('npm run notebook:add <URL_COMPARTIDA_NOTEBOOKLM> "Legislación Laboral"');
  } catch (error) {
    console.error('\n❌ Error durante la autenticación:', error.message);
    process.exit(1);
  }
}

main();
