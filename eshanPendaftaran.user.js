// ==UserScript==
// @name         Kirim Data Pendaftaran ke WA & GSheet (Merged)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Mengirim data pasien ke WA otomatis + Kirim ke GSheet (Merged)
// @author       Gemini & Anda
// @match        https://id1-eshan.co.id/pmim/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      192.168.1.10
// @connect      192.168.1.10:5001
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/irsamadjid/script-klinik/main/eshanPendaftaran.user.js
// @downloadURL  https://raw.githubusercontent.com/irsamadjid/script-klinik/main/eshanPendaftaran.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- KONFIGURASI ---
    const WA_API_URL = "https://wabot.dokterizza.my.id/send";
    const WA_TARGET_GROUP = "120363423716715740@g.us";

    // --- GLOBAL LOCK VARIABLE (KUNCI UTAMA) ---
    let isGlobalSending = false;
    let waAlreadySent = false; // Flag untuk tracking apakah WA sudah dikirim

    // --- VALIDASI HALAMAN (Baru) ---
    // Mengecek apakah kita benar-benar berada di Tab Pendaftaran yang aktif
    const isPendaftaranTabActive = () => {
        // Mencari elemen <a> dengan href="#tab-1" yang memiliki class "active"
        const activeTab = document.querySelector('a.nav-link.active[href="#tab-1"]');

        // Jika elemen ditemukan dan teksnya mengandung "Pendaftaran", return true
        if (activeTab && activeTab.innerText.includes('Pendaftaran')) {
            return true;
        }
        return false;
    };

    // --- FUNGSI PENGAMBIL DATA ---
    const getValueByLabel = (keywords) => {
        if (!Array.isArray(keywords)) keywords = [keywords];
        for (const keyword of keywords) {
            const xpath = `//*[contains(text(), '${keyword}')]`;
            const snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < snapshot.snapshotLength; i++) {
                const el = snapshot.snapshotItem(i);
                if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
                const fullText = el.textContent || el.innerText;

                if (fullText.includes(':')) {
                    const parts = fullText.split(':');
                    if (parts[0].toLowerCase().includes(keyword.toLowerCase())) {
                        const val = parts.slice(1).join(':').trim();
                        if (val) return val;
                    }
                }
                let sibling = el.nextElementSibling;
                if (sibling) {
                    let sibText = sibling.textContent || sibling.innerText;
                    if (sibText) return sibText.replace(/^[:\s]+/, '').trim();
                }
                if (el.tagName === 'TD') {
                    let nextTd = el.nextElementSibling;
                    if (nextTd) return (nextTd.textContent || nextTd.innerText).replace(/^[:\s]+/, '').trim();
                }
            }
        }
        return '';
    };

    const getValueById = (selector) => {
        const el = document.querySelector(selector);
        if (el) {
            const val = el.value || el.textContent || el.innerText;
            return val ? val.replace(/^[:\s]+/, '').trim() : '';
        }
        return '';
    };

    const smartGetValue = (idSelector, labelKeywords) => {
        let val = getValueById(idSelector);
        if (!val || val === '-') {
            val = getValueByLabel(labelKeywords);
        }
        return val || '-';
    };

    const parseDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return null;
        const match = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (match) {
            return new Date(`${match[3]}-${match[2]}-${match[1]}`);
        }
        return null;
    };

    const calculateAgeDetail = (dobStr) => {
        if (!dobStr || dobStr === '-') return "- th - bln";
        const birthDate = parseDate(dobStr);
        if (!birthDate) return dobStr;
        const today = new Date();
        let years = today.getFullYear() - birthDate.getFullYear();
        let months = today.getMonth() - birthDate.getMonth();
        if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
            years--;
            months += 12;
        }
        if (today.getDate() < birthDate.getDate()) {
            months--;
            if (months < 0) months = 11;
        }
        return `${years} th ${months} bln`;
    };

    const collectPatientData = () => {
        const nama = smartGetValue('#inp_PatientName', ['Nama Pasien', 'Nama']);
        const dob = smartGetValue('#inp_DateofBirth', ['Tanggal Lahir', 'Tgl Lahir']);
        const usia = calculateAgeDetail(dob);
        const jkRaw = smartGetValue('#inp_Gender', ['Jenis Kelamin', 'Gender']);
        const jk = (jkRaw.toLowerCase().includes('laki') || jkRaw === '1' || jkRaw.toLowerCase().startsWith('l')) ? 'L' : 'P';
        const bb = smartGetValue('#inp_BeratBadan', ['Berat Badan', 'BB']);
        const keluhan = smartGetValue('#inp_Complaint', ['Keluhan', 'Anamnesis']);
        const sistole = smartGetValue('#inp_TekananDarahSistole', ['Sistole']);
        const diastole = smartGetValue('#inp_TekananDarahDiastole', ['Diastole']);
        const hr = smartGetValue('#inp_HeartRate', ['Heart Rate', 'Nadi', 'HR']);
        const spo = smartGetValue('#inp_OxygenSaturation', ['SpO2', 'Saturasi']);
        const suhu = smartGetValue('#inp_Suhu', ['Suhu']);

        return { nama, dob, usia, jk, bb, keluhan, sistole, diastole, hr, spo, suhu };
    };

    // Toast Notifikasi
    const showToast = (text, color = '#333') => {
        const oldToast = document.getElementById('wa-toast-notif');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'wa-toast-notif';
        toast.innerText = text;
        Object.assign(toast.style, {
            position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            backgroundColor: color, color: 'white', padding: '10px 20px',
            borderRadius: '5px', zIndex: '10000', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', fontWeight: 'bold'
        });
        document.body.appendChild(toast);
        setTimeout(() => { if(toast) toast.remove(); }, 3000);
    };

    // Kirim ke API dengan callback
    const sendToWA = (messageText, callback) => {
        console.log("=== MENGIRIM WA ===", messageText);
        showToast("⏳ Mengirim data...", "#007bff");

        GM_xmlhttpRequest({
            method: "POST",
            url: WA_API_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ to: WA_TARGET_GROUP, message: messageText }),
            anonymous: true,
            timeout: 5000, // Timeout 5 detik
            onload: function(res) {
                if (res.status >= 200 && res.status < 300) {
                    console.log("✅ WA Berhasil");
                    showToast("✅ Terkirim!", "#28a745");
                } else {
                    console.error("❌ Gagal:", res.responseText);
                    showToast("❌ Gagal Kirim API", "#dc3545");
                }
                // Panggil callback setelah selesai (sukses atau gagal)
                if (callback) callback();
            },
            onerror: function(err) {
                console.error("❌ Error Jaringan", err);
                showToast("❌ Error Koneksi", "#dc3545");
                // Panggil callback meskipun error
                if (callback) callback();
            },
            ontimeout: function() {
                console.error("❌ Timeout");
                showToast("❌ Timeout", "#dc3545");
                // Panggil callback jika timeout
                if (callback) callback();
            }
        });
    };

    // --- EVENT HANDLER ---

    const handleSaveClick = (event) => {
        // STRATEGI BARU: Delay event asli, kirim WA di background, lanjutkan otomatis
        
        // 0. CEK HALAMAN (VALIDASI BARU)
        // Jika bukan di Tab Pendaftaran yang aktif, STOP.
        if (!isPendaftaranTabActive()) {
             console.log("⛔ STOP: Bukan Tab Pendaftaran (Active).");
             return;
        }

        // Jika WA sudah dikirim, biarkan event berjalan normal
        if (waAlreadySent) {
            console.log('[Pendaftaran WA] WA sudah terkirim sebelumnya, lanjutkan save...');
            waAlreadySent = false; // Reset untuk next time
            return; // Biarkan event asli jalan
        }

        // 1. CEK GLOBAL LOCK
        if (isGlobalSending) {
            console.warn("⚠️ Pendaftaran: Sedang mengirim WA, tunggu...");
            event.preventDefault();
            event.stopPropagation();
            return; // Hentikan mutlak
        }

        // Ambil Data SEBELUM mengunci
        const d = collectPatientData();

        // --- VALIDASI KERAS ---
        if (!d.nama || d.nama === '-' || d.nama.trim() === '') {
            console.warn("⛔ STOP: Nama pasien kosong/strip. Tidak dikirim ke WA.");
            return; // Biarkan proses save normal jalan
        }

        // BLOKIR event hanya untuk click pertama (untuk delay)
        event.preventDefault();
        event.stopPropagation();

        // 3. AKTIFKAN LOCK
        isGlobalSending = true;

        console.log('[Pendaftaran WA] Mengirim WA terlebih dahulu...');

        // Format Pesan
        let message = `${d.nama} / ${d.jk} / ${d.usia} / ${d.bb}kg\n\n`;
        message += `S : ${d.keluhan}\n\n`;
        message += `O: \n`;
        message += `TD ${d.sistole} / ${d.diastole} mmHg\n`;
        message += `HR ${d.hr} x/mnt\n`;
        message += `SpO2 ${d.spo} %\n`;
        message += `Suhu ${d.suhu} °C`;

        // Kirim WA tanpa blocking (fire and forget dengan timeout singkat)
        sendToWA(message, function() {
            // Callback: dipanggil setelah WA terkirim/gagal
            console.log("✅ Pendaftaran WA selesai dikirim");
            waAlreadySent = true; // Set flag bahwa WA sudah terkirim
            isGlobalSending = false;
            
            // Trigger klik ulang setelah WA terkirim
            console.log('[Pendaftaran WA] Melanjutkan proses save...');
            const saveBtn = document.querySelector('#idButtonSave');
            if (saveBtn) {
                setTimeout(() => {
                    saveBtn.click(); // Klik ulang, kali ini akan lolos karena waAlreadySent = true
                }, 100);
            }
        });
    };

    // --- LOOP UTAMA ---

    setInterval(() => {
        const saveBtn = document.querySelector('#idButtonSave');

        if (saveBtn) {
            if (saveBtn.getAttribute('data-wa-ready') !== "yes") {
                console.log("✅ Tombol ditemukan, memasang listener...");
                // Gunakan 'click' bukan 'mousedown' agar tidak menghalangi fungsi asli
                saveBtn.addEventListener('click', handleSaveClick, true);
                saveBtn.setAttribute('data-wa-ready', 'yes');
            }
        }
    }, 1000);

})();

(function() {
    'use strict';

    // -------------------------------------------------------------------
    // URL Web App Anda
    // -------------------------------------------------------------------
    const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxgMEUQHJIWzMxT2ukR2nLkQC_r4t_6T9_bniSoRt1UHEqw63h8Z7Fb9oP6eDfk0-DT/exec';

    /**
     * Fungsi untuk mencari nilai berdasarkan label di halaman.
     */
    function findValueByLabel(label) {
        let cells = document.querySelectorAll('td, th');
        for (let i = 0; i < cells.length; i++) {
            if (cells[i].textContent.trim() === label) {
                let valueCell = cells[i].nextElementSibling?.nextElementSibling;
                if (valueCell) {
                    return valueCell.textContent.trim();
                }
            }
        }
        return '-';
    }

    /**
     * [BARU] Fungsi untuk menstandardisasi format tanggal ke YYYY-MM-DD
     */
    function standardizeDate(dateString) {
        if (!dateString || dateString === '-') return '-';

        let parts;
        let day, month, year;

        try {
            if (dateString.includes('/')) {
                // Asumsi format DD/MM/YYYY atau M/D/YYYY
                parts = dateString.split('/');
            } else if (dateString.includes('-')) {
                // Asumsi format DD-MM-YYYY
                parts = dateString.split('-');
            } else {
                return dateString; // Tidak dikenali, kembalikan apa adanya
            }

            if (parts.length === 3) {
                day = parts[0].padStart(2, '0');
                month = parts[1].padStart(2, '0');
                year = parts[2];

                // Pastikan tahun adalah 4 digit
                if (year.length === 4) {
                    return `${year}-${month}-${day}`; // Format YYYY-MM-DD
                } else {
                    // Coba balik jika formatnya YYYY-MM-DD (kasus 19-01-1988)
                    day = parts[0];
                    month = parts[1];
                    year = parts[2];
                    if(day.length === 4) { // Deteksi jika formatnya YYYY-MM-DD
                       return `${day}-${month.padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (year.length === 4) { // Deteksi jika DD-MM-YYYY
                       return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing date:', dateString, e);
            return dateString; // Kembalikan asli jika error
        }
        return dateString; // Kembalikan asli jika tidak cocok
    }


    /**
     * Fungsi utama untuk mengambil semua data pasien dari halaman
     */
    function scrapePatientData() {
        let data = {};
        data.inp_PatientCode = findValueByLabel('Nomor Rekam Medis');
        data.inp_IdentityID = findValueByLabel('No Identitas');
        data.inp_PatientName = findValueByLabel('Nama Pasien');
        data.inp_Gender = findValueByLabel('Jenis Kelamin');
        data.inp_PlaceofBirth = findValueByLabel('Tempat Lahir');

        // [MODIFIKASI] Ambil tanggal mentah dan standardisasi
        let rawDate = findValueByLabel('Tanggal Lahir');
        data.inp_DateofBirth = standardizeDate(rawDate);

        data.inp_NoHp = findValueByLabel('No HP');
        data.inp_Address = findValueByLabel('Alamat');
        data.inp_Insurance = findValueByLabel('Asuransi');

        // [DIHAPUS] Baris timestamp dihapus dari sini
        // data.Timestamp = new Date().toISOString();

        return data;
    }

    /**
     * Fungsi untuk mengirim data ke Google Apps Script
     */
    function sendDataToGSheet(data, button) {
        button.disabled = true;
        button.textContent = 'Mengirim...';

        GM_xmlhttpRequest({
            method: 'POST',
            url: GAS_WEB_APP_URL,
            data: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            },
            onload: function(response) {
                console.log('Respon GAS:', response.responseText);
                let json = JSON.parse(response.responseText);
                if (json.status === 'success') {
                    button.textContent = 'Sukses!';
                    button.style.backgroundColor = '#4CAF50';
                } else {
                    button.textContent = 'Error! (Cek Console)';
                    button.style.backgroundColor = '#f44336';
                    console.error('Error dari GAS:', json.message);
                }
                setTimeout(() => {
                    button.disabled = false;
                    button.textContent = 'Kirim ke GSheet';
                    button.style.backgroundColor = '#008CBA';
                }, 3000);
            },
            onerror: function(error) {
                console.error('Error Tampermonkey:', error);
                button.disabled = false;
                button.textContent = 'Error! (Cek Console)';
                button.style.backgroundColor = '#f44336';
            }
        });
    }

    // ... sisa fungsi (addButtonToHeader, findAndPlaceButton, interval) tetap sama ...
    // Salin-tempel saja bagian di atas untuk menggantikan fungsi yang ada

    /**
     * Fungsi untuk membuat dan menambahkan tombol "Kirim" ke elemen target
     */
    function addButtonToHeader(targetElement) {
        let button = document.createElement('button');
        button.id = 'sendToGSheetButton';
        button.textContent = 'Kirim ke GSheet';

        // --- STYLE BARU ---
        button.style.float = 'right';
        button.style.fontSize = '15px';
        button.style.padding = '2px 10px';
        button.style.margin = '0px 5px 0px 0px';
        button.style.lineHeight = '1.2';
        button.style.backgroundColor = '#008CBA';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';

        button.onclick = function(e) {
            e.stopPropagation();
            let data = scrapePatientData();
            console.log('Data yang diekstrak:', data);
            sendDataToGSheet(data, button);
        };

        targetElement.prepend(button);
        targetElement.style.overflow = 'auto';
    }

    /**
     * Fungsi untuk mencari elemen header "Pasien"
     */
    function findAndPlaceButton() {
        let allCols = document.querySelectorAll('div.col-sm-10');
        let targetElement = null;

        for (let col of allCols) {
            if (col.textContent.trim().startsWith('Pasien')) {
                targetElement = col;
                break;
            }
        }

        if (targetElement) {
            addButtonToHeader(targetElement);
            return true;
        }
        return false;
    }

    const maxTries = 50;
    let tries = 0;
    let interval = setInterval(() => {
        if (findAndPlaceButton() || tries++ > maxTries) {
            clearInterval(interval);
            if (tries > maxTries) {
                console.warn('Tampermonkey: Tidak dapat menemukan header "Pasien" (div.col-sm-10). Tombol tidak ditambahkan.');
            }
        }
    }, 200);

})();