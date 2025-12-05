// ==UserScript==
// @name         Cetak Struk & Lunas Kasir (58mm) - Auto WA on Save
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Tombol Simpan (#idButtonSave) otomatis kirim WA. Tombol Cetak Struk manual hanya print fisik.
// @author       Gemini
// @match        https://id1-eshan.co.id/pmim/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      192.168.1.10
// @connect      192.168.1.10:5001
// @connect      http://192.168.1.10:5001
// @connect      *
// @updateURL    https://raw.githubusercontent.com/irsamadjid/script-klinik/main/eshanKasir.user.js
// @downloadURL  https://raw.githubusercontent.com/irsamadjid/script-klinik/main/eshanKasir.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    // New WA API endpoint (uses API key header X-API-Key)
    const WA_API_URL = "https://wa.api.dokterizza.my.id/api/send";
    const WA_TARGET_JID = "120363422166744171@g.us";

    // --- Helper Functions ---

    const waitForElement = (selector, timeout = 2000) => {
        return new Promise((resolve, reject) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
            const observer = new MutationObserver((mutations, obs) => {
                if (document.querySelector(selector)) {
                    obs.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for element: ${selector}`));
            }, timeout);
        });
    };

    const findValueByLabelView = (label) => {
        try {
            let labelNode = document.evaluate(`//td[normalize-space()='${label}']/following-sibling::td[2]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (!labelNode) labelNode = document.evaluate(`//td[contains(normalize-space(), '${label}')]/following-sibling::td[2]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return labelNode ? labelNode.textContent.trim() : '-';
        } catch (e) { return '-'; }
    };

    const findValueByLabelForm = (label) => {
        try {
            const labelNode = document.evaluate(`//div[contains(@class, 'col-sm-4') and normalize-space()='${label}']`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (labelNode) {
                const valueNode = labelNode.nextElementSibling;
                if (valueNode && valueNode.classList.contains('col-sm-8')) {
                    const textContent = valueNode.textContent.trim();
                    const colonIndex = textContent.indexOf(':');
                    return colonIndex !== -1 ? textContent.substring(colonIndex + 1).trim() : textContent;
                }
            }
            return '-';
        } catch (e) { return '-'; }
    };

    const formatCurrency = (numberStr) => {
        const cleanedStr = String(numberStr).replace(/[^0-9.-]/g, '');
        const number = parseFloat(cleanedStr);
        return isNaN(number) ? numberStr : number.toLocaleString('id-ID');
    };

    const cleanCurrency = (currencyStr) => {
        return String(currencyStr).replace(/[.,]/g, '');
    };

    // --- Validation Logic ---
    const isValidCashierAddPage = () => {
        try {
            const breadcrumb = document.querySelector('.top_nav_left .breadcrumb');
            if (!breadcrumb) return false;

            const items = breadcrumb.querySelectorAll('li');
            if (items.length < 4) return false;

            // Validasi urutan: Pelayanan > Rawat Jalan > Kasir > Tambah
            const txt = (el) => el.textContent.trim();

            return txt(items[0]) === 'Pelayanan' &&
                   txt(items[1]) === 'Rawat Jalan' &&
                   txt(items[2]) === 'Kasir' &&
                   txt(items[3]) === 'Tambah';
        } catch (e) {
            return false;
        }
    };

    // --- WhatsApp Functionality ---

    const sendWhatsApp = (targetJid, messageText, callback) => {
        console.log("=== SENDING WA (Silent) ===");
        GM_xmlhttpRequest({
                method: "POST",
                url: WA_API_URL,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                    "X-API-Key": "Irsa&Izza"
                },
                data: JSON.stringify({
                    to: targetJid,
                    message: messageText
                }),
                anonymous: true,
                timeout: 500,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                       console.log("WA Sukses Terkirim");
                    } else {
                       console.error(`Gagal Kirim! Status: ${response.status}\nRespon: ${response.responseText}`);
                    }
                    // Invoke resume callback now that request finished
                    try { if (callback) callback(); } catch (e) { console.error('callback error', e); }
                },
                onerror: function(err) { 
                    console.error("Network Error:", err);
                    try { if (callback) callback(); } catch (e) { console.error('callback error', e); }
                },
                ontimeout: function() { 
                    console.error("Timeout! Server tidak merespon.");
                    try { if (callback) callback(); } catch (e) { console.error('callback error', e); }
                }
            });
    };

    // --- Data Extraction ---

    const getTransactionData = () => {
        // Deteksi halaman
        const isAddPage = isValidCashierAddPage();
        const isViewPage = !isAddPage && !!document.querySelector("input[name='total_all'][readonly]");

        if (!isAddPage && !isViewPage) return null;

        let tanggalTransaksi, namaPasien, alamat, noHp, items = [], grandTotalMedis = '0';

        if (isViewPage) {
            const now = new Date();
            tanggalTransaksi = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            namaPasien = findValueByLabelView("Nama Pasien") || '-';
            alamat = findValueByLabelView("Alamat") || '-';
            noHp = findValueByLabelView("No. HP") || findValueByLabelView("No HP") || findValueByLabelView("Telepon") || '-';
        } else {
            const now = new Date();
            tanggalTransaksi = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            namaPasien = document.getElementById('patient_name')?.value || findValueByLabelForm("Nama Pasien") || '-';
            alamat = document.getElementById('address')?.value || findValueByLabelForm("Alamat") || '-';
            const hpInput = document.getElementById('handphone');
            noHp = hpInput ? hpInput.value : (findValueByLabelForm("No. HP") || findValueByLabelForm("No HP") || '-');
            if (alamat.includes(',')) {
                const alamatLabel = findValueByLabelForm("Alamat");
                if (alamatLabel && alamatLabel !== '-') alamat = alamatLabel.split(',')[0].trim();
            }
        }

        try {
            const headingNode = document.evaluate("//span[normalize-space()='Rincian Transaksi Layanan Medis']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (headingNode) {
                const tableContainer = headingNode.nextElementSibling;
                const table = tableContainer ? tableContainer.querySelector("table") : null;
                if (table) {
                    const rows = table.querySelectorAll("tbody tr");
                    rows.forEach(row => {
                        const cells = row.querySelectorAll("td");
                        let namaPelayanan = '', subtotal = '0';
                        if (isViewPage && cells.length >= 8) {
                            namaPelayanan = cells[2].textContent.trim();
                            subtotal = cells[7].textContent.trim();
                        } else {
                            const nameInput = row.querySelector('input[id^="service_name_"]');
                            const subtotalInput = row.querySelector('input[id^="total_"]');
                            if (nameInput) namaPelayanan = nameInput.value.trim();
                            if (subtotalInput) subtotal = subtotalInput.value.trim();
                        }
                        if (namaPelayanan) items.push({ nama: namaPelayanan, subtotal: subtotal });
                    });

                    let grandTotalCell;
                    if (isViewPage) {
                        grandTotalCell = table.querySelector("tfoot th:last-child");
                        if(grandTotalCell) grandTotalMedis = grandTotalCell.textContent.trim();
                    } else {
                        grandTotalCell = table.querySelector("tfoot input[id='total_itemtransaction']");
                        if(grandTotalCell) grandTotalMedis = grandTotalCell.value.trim();
                    }

                    if (!grandTotalMedis || grandTotalMedis === '0') {
                        let calculatedTotal = 0;
                        items.forEach(item => { calculatedTotal += parseFloat(cleanCurrency(item.subtotal)) || 0; });
                        grandTotalMedis = calculatedTotal.toString();
                    }
                }
            }
        } catch (e) { console.error(e); }

        return { tanggalTransaksi, namaPasien, alamat, noHp, items, grandTotalMedis };
    };

    // --- Actions ---

    // Fungsi 1: Hanya kirim WA (untuk Trigger tombol Simpan)
    const actionSendWA = () => {
        const data = getTransactionData();
        if (!data) return;

        console.log("Memproses Struk Digital (WA)...");
        let waMessage = `*STRUK KASIR DIGITAL*\nPRAKTEK DOKTER IZZA\n--------------------------------\n`;
        waMessage += `Tanggal: ${data.tanggalTransaksi}\nPasien : ${data.namaPasien} (${data.noHp})\nAlamat : ${data.alamat}\n--------------------------------\n`;
        data.items.forEach(item => { waMessage += `${item.nama}\nRp ${formatCurrency(item.subtotal)}\n`; });
        waMessage += `--------------------------------\n*GRAND TOTAL: Rp ${formatCurrency(data.grandTotalMedis)}*\n--------------------------------\n`;

        sendWhatsApp(WA_TARGET_JID, waMessage);
    };

    // Fungsi 2: Hanya Print Fisik (untuk Tombol Manual)
    const actionPrintPhysical = () => {
        const data = getTransactionData();
        if (!data) return;

        console.log("Memproses Cetak Fisik...");
        let receiptHTML = `<html><head><title>Struk Kasir</title><style>body { font-family: 'Courier New', Courier, monospace; font-size: 10px; width: 58mm; margin: 0; padding: 2mm; box-sizing: border-box; } .center { text-align: center; } .divider { border-top: 1px dashed #000; margin: 5px 0; } .header-info div { display: flex; justify-content: space-between; margin-bottom: 2px; } .header-info span:first-child { width: 35%; padding-right: 5px; } .header-info span:last-child { width: 65%; text-align: right; } .items-table .item-row { margin-top: 3px; } .items-table .item-details { display: flex; justify-content: space-between; } .total { margin-top: 5px; display: flex; justify-content: space-between; font-weight: bold; font-size: 11px;} @page { size: 58mm auto; margin: 2mm; } @media print { #print-receipt-btn, #lunas-btn, #obat-nol-btn { display: none !important; } }</style></head><body onload="window.focus(); window.print(); setTimeout(window.close, 500);"><h3 class="center" style="margin-bottom: 5px;">STRUK KASIR</h3><div class="center" style="margin-bottom: 5px;">PRAKTEK DOKTER IZZA</div><div class="divider"></div><div class="header-info"><div><span>Tanggal:</span> <span>${data.tanggalTransaksi}</span></div><div><span>Pasien:</span> <span>${data.namaPasien}</span></div><div><span>Alamat:</span> <span>${data.alamat}</span></div></div><div class="divider"></div><div class="items-table">`;
        data.items.forEach(item => { receiptHTML += `<div class="item-row"><div class="item-details"><span>${item.nama}</span><span>${formatCurrency(item.subtotal)}</span></div></div>`; });
        receiptHTML += `</div><div class="divider"></div><div class="total"><span>GRAND TOTAL:</span><span>${formatCurrency(data.grandTotalMedis)}</span></div><div class="divider"></div><div class="center" style="margin-top: 10px;">Terima kasih.</div></body></html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) { printWindow.document.write(receiptHTML); printWindow.document.close(); }
    };

    const markAsLunas = async () => {
        try {
            const tunaiCheckbox = document.querySelector('input[type="checkbox"][payment_name="Tunai"]');
            if (tunaiCheckbox) {
                if (!tunaiCheckbox.checked) tunaiCheckbox.click();
                const totalTagihanInput = document.getElementById('subtotal_all');
                if (totalTagihanInput) {
                    const tunaiRow = await waitForElement(`#tbodypaymenttype tr[id='${tunaiCheckbox.value}']`);
                    const tunaiSubtotalInput = tunaiRow.querySelector('input[id^="paymenttype_value_"]');
                    if (tunaiSubtotalInput) {
                        tunaiSubtotalInput.value = totalTagihanInput.value;
                        tunaiSubtotalInput.dispatchEvent(new Event('input', { bubbles: true }));
                        tunaiSubtotalInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                    }
                }
            }
        } catch (e) { console.error(e); }
    };

    const setObatNol = () => {
        try {
            document.querySelectorAll("select[id^='discount_type2_']").forEach(select => {
                const parts = select.id.split('_');
                if (parts.length >= 3) {
                    const valueInput = document.getElementById(`discount2_${parts[2]}`);
                    if (valueInput) {
                        select.value = '2'; // Tipe %
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        valueInput.value = '100'; // Nilai 100%
                        valueInput.dispatchEvent(new Event('input', { bubbles: true }));
                        valueInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                        valueInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
        } catch (e) { console.error(e); }
    };

    // --- Global Lock Variable ---
    let isGlobalSendingKasir = false;
    let waAlreadySentKasir = false; // Flag untuk tracking apakah WA sudah dikirim

    const hookSaveButton = () => {
        // Hanya hook di halaman Tambah Kasir yang valid
        if (!isValidCashierAddPage()) return;

        const saveBtn = document.getElementById('idButtonSave');
        // Pastikan tombol ada dan belum di-hook sebelumnya
        if (saveBtn && !saveBtn.hasAttribute('data-receipt-hooked')) {
            console.log("Tombol Simpan (#idButtonSave) ditemukan. Auto WA trigger ditambahkan.");
            
            // STRATEGI BARU: Delay event asli, kirim WA di background, lanjutkan otomatis
            saveBtn.addEventListener('click', (event) => {
                // Jika WA sudah dikirim, biarkan event berjalan normal
                if (waAlreadySentKasir) {
                    console.log('[Kasir WA] WA sudah terkirim sebelumnya, lanjutkan save...');
                    waAlreadySentKasir = false; // Reset untuk next time
                    return; // Biarkan event asli jalan
                }

                // Cek global lock
                if (isGlobalSendingKasir) {
                    console.warn("⚠️ Kasir: Sedang mengirim WA, tunggu...");
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                const data = getTransactionData();
                if (!data) {
                    console.log("Kasir: Tidak ada data transaksi, lanjutkan save normal");
                    return; // Biarkan proses save normal jalan
                }

                // BLOKIR event hanya untuk click pertama (untuk delay)
                event.preventDefault();
                event.stopPropagation();

                // Aktifkan lock
                isGlobalSendingKasir = true;

                console.log("Memproses Struk Digital (WA)...");
                let waMessage = `*STRUK KASIR DIGITAL*\nPRAKTEK DOKTER IZZA\n--------------------------------\n`;
                waMessage += `Tanggal: ${data.tanggalTransaksi}\nPasien : ${data.namaPasien} (${data.noHp})\nAlamat : ${data.alamat}\n--------------------------------\n`;
                data.items.forEach(item => { waMessage += `${item.nama}\nRp ${formatCurrency(item.subtotal)}\n`; });
                waMessage += `--------------------------------\n*GRAND TOTAL: Rp ${formatCurrency(data.grandTotalMedis)}*\n--------------------------------\n`;

                // Kirim WA tanpa blocking (fire and forget dengan timeout singkat)
                sendWhatsApp(WA_TARGET_JID, waMessage, function() {
                    console.log("✅ Kasir WA selesai dikirim");
                    waAlreadySentKasir = true; // Set flag bahwa WA sudah terkirim
                    isGlobalSendingKasir = false;
                    
                    // Trigger klik ulang setelah WA terkirim
                    console.log('[Kasir WA] Melanjutkan proses save...');
                    // Delay 1 detik (user requested) sebelum melanjutkan event asli
                    setTimeout(() => {
                        saveBtn.click(); // Klik ulang, kali ini akan lolos karena waAlreadySentKasir = true
                    }, 1000);
                });
            }, true);
            
            saveBtn.setAttribute('data-receipt-hooked', 'true');
        }
    };

    const initUI = () => {
        const isOnCashierAddPage = isValidCashierAddPage();
        const isOnCashierViewPage = window.location.href.includes('tp=2106940270404&access=104');

        if (isOnCashierAddPage || isOnCashierViewPage) {
            // -- Tombol Manual: Panggil actionPrintPhysical (hanya cetak kertas) --
            if (!document.getElementById('print-receipt-btn')) {
                const printButton = document.createElement('button');
                printButton.textContent = 'Cetak Struk';
                printButton.id = 'print-receipt-btn';
                printButton.addEventListener('click', actionPrintPhysical);
                document.body.appendChild(printButton);
            }

            if (isOnCashierAddPage) {
                // Hook tombol Simpan: Panggil actionSendWA (hanya kirim WA)
                hookSaveButton();

                if (!document.getElementById('lunas-btn')) {
                    const lunasButton = document.createElement('button');
                    lunasButton.textContent = 'Lunas';
                    lunasButton.id = 'lunas-btn';
                    lunasButton.addEventListener('click', markAsLunas);
                    document.body.appendChild(lunasButton);
                }
                if (!document.getElementById('obat-nol-btn')) {
                    const obatNolButton = document.createElement('button');
                    obatNolButton.textContent = 'Obat Rp 0';
                    obatNolButton.id = 'obat-nol-btn';
                    obatNolButton.addEventListener('click', setObatNol);
                    document.body.appendChild(obatNolButton);
                }
            }
        } else {
            document.getElementById('print-receipt-btn')?.remove();
            document.getElementById('lunas-btn')?.remove();
            document.getElementById('obat-nol-btn')?.remove();
        }
    };

    GM_addStyle(`#print-receipt-btn, #lunas-btn, #obat-nol-btn { position: fixed; bottom: 40px; z-index: 10001; color: white; border: none; border-radius: 5px; padding: 10px 15px; font-size: 14px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2); margin-left: 5px; } #print-receipt-btn { right: 10px; background-color: #007bff; } #lunas-btn { right: 135px; background-color: #28a745; } #obat-nol-btn { right: 220px; background-color: #6f42c1; } @media print { #print-receipt-btn, #lunas-btn, #obat-nol-btn { display: none !important; } }`);

    const observer = new MutationObserver(initUI);
    const startObserver = () => {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
            initUI();
        } else {
            setTimeout(startObserver, 100);
        }
    };
    startObserver();
})();