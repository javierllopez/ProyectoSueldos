import { callNotebooklmMcp } from './mcpClient.js';

async function main() {
  const question = process.argv.slice(2).join(' ');

  if (!question) {
    console.log('❌ Debes ingresar una pregunta.');
    console.log('\nUso:');
    console.log('npm run notebook:query "¿Cómo se calcula la indemnización del art 245 LCT?"');
    process.exit(1);
  }

  console.log(`🤖 Consultando NotebookLM / Gemini Notebook...`);
  console.log(`❓ Pregunta: "${question}"\n`);
  console.log('⏳ Procesando consulta con tus fuentes documentales...\n');

  try {
    const result = await callNotebooklmMcp('ask_question', {
      question,
      source_format: 'inline'
    }, 120000);

    const answer = result?.data?.answer || result?.answer || result?.content?.[0]?.text || JSON.stringify(result, null, 2);
    const citations = result?.data?.citations || result?.citations || [];

    console.log('====================================================');
    console.log('                RESPUESTA DE NOTEBOOKLM             ');
    console.log('====================================================\n');
    console.log(answer);
    console.log('\n====================================================');

    if (citations.length > 0) {
      console.log('\n📖 Citas / Fuentes consultadas:');
      citations.forEach((c, i) => {
        console.log(` [${i + 1}] ${c.title || c.source || 'Fuente'}: ${c.text || ''}`);
      });
    }
  } catch (error) {
    console.error('❌ Error realizando la consulta:', error.message);
    process.exit(1);
  }
}

main();
