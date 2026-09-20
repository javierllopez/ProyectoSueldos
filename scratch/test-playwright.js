import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Iniciando Playwright con Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('🌐 Navegando a http://localhost:3000/login.html...');
  await page.goto('http://localhost:3000/login.html', { waitUntil: 'networkidle' });

  console.log('🔐 Usando botón de credenciales demo...');
  await page.click('#btn-demo-creds');
  await page.waitForTimeout(300);

  const emailVal = await page.$eval('#email', el => el.value);
  console.log(`👤 Usuario cargado: ${emailVal}`);

  await page.click('button[type="submit"]');

  console.log('⏳ Esperando redirección a app.html...');
  await page.waitForURL('**/app.html', { timeout: 10000 });
  await page.waitForTimeout(2000);

  const title = await page.title();
  console.log(`📄 Título de la página principal: "${title}"`);

  // 1. Clic en módulo Sueldos
  console.log('📊 Navegando al módulo Sueldos (data-view-target="payroll")...');
  await page.click('a[data-view-target="payroll"]');
  await page.waitForTimeout(1500);

  // 2. Clic en Novedades Persistentes por Colaborador
  console.log('📋 Desplegando menú Novedades Persistentes...');
  const subMenuBtn = await page.$('#side-nov-pers-menu');
  if (subMenuBtn) {
    const isExpanded = await subMenuBtn.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await subMenuBtn.click();
      await page.waitForTimeout(500);
    }
  }

  const subItemBtn = await page.$('#side-nov-pers-emp');
  if (subItemBtn) {
    console.log('🎯 Seleccionando pestaña Persistentes por Colaborador...');
    await subItemBtn.click();
    await page.waitForTimeout(1500);
  }

  // 3. Buscar el selector TomSelect #nov-pers-emp-select
  console.log('🔍 Inspeccionando TomSelect en #nov-pers-emp-select...');
  const tsWrapper = await page.$('#pane-nov-pers-emp .ts-wrapper');
  if (tsWrapper) {
    console.log('✅ .ts-wrapper encontrado.');
    const tsControl = await page.$('#pane-nov-pers-emp .ts-control');
    if (tsControl) {
      console.log('🎯 Clic en el combo box para desplegar opciones...');
      await tsControl.click();
      await page.waitForTimeout(800);

      const dropdown = await page.$('#pane-nov-pers-emp .ts-dropdown');
      if (dropdown) {
        const isVisible = await dropdown.isVisible();
        const style = await page.evaluate(({ el, isVis }) => {
          const cs = window.getComputedStyle(el);
          const firstOpt = el.querySelector('.option');
          const optCs = firstOpt ? window.getComputedStyle(firstOpt) : null;
          return {
            dropdownVisible: isVis,
            dropdownBg: cs.backgroundColor,
            dropdownColor: cs.color,
            dropdownBorder: cs.borderColor,
            dropdownBoxShadow: cs.boxShadow,
            dropdownZIndex: cs.zIndex,
            firstOptionBg: optCs ? optCs.backgroundColor : null,
            firstOptionColor: optCs ? optCs.color : null,
            firstOptionText: firstOpt ? firstOpt.textContent.trim().substring(0, 40) : null,
          };
        }, { el: dropdown, isVis: isVisible });

        console.log('✨ Estilos computados y estado del dropdown TomSelect:');
        console.log(JSON.stringify(style, null, 2));
      }
    }
  } else {
    console.log('⚠️ #pane-nov-pers-emp .ts-wrapper no encontrado.');
  }

  const screenshotPath = 'C:/Users/javie/.gemini/antigravity-ide/brain/cf766c88-2af3-4f99-9136-6e59af0b01d1/dropdown_verified.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`📸 Captura de pantalla guardada exitosamente en:\n${screenshotPath}`);

  await browser.close();
  console.log('🎉 ¡Prueba de Playwright completada con éxito total!');
})().catch(err => {
  console.error('❌ Error en prueba Playwright:', err);
  process.exit(1);
});
