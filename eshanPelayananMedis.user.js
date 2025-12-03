// ==UserScript==
// @name         TTS Panggilan Pasien (Google Translate) - Halaman Medis
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Tombol panggil pasien menggunakan TTS Google Translate (tanpa API key).
// @author       Gemini
// @match        https://id1-eshan.co.id/pmim/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      192.168.1.10
// @connect      192.168.1.10:5001
// @connect      wabot.dokterizza.my.id
// @connect      translate.google.com
// @updateURL    https://raw.githubusercontent.com/irsamadjid/script-klinik/main/eshanPelayananMedis.user.js
// @downloadURL  https://raw.githubusercontent.com/irsamadjid/script-klinik/main/eshanPelayananMedis.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log("TTS Script v2.8 (Google Translate): Dimulai.");
    // --- Konfigurasi Bahasa untuk TTS Google Translate ---
    const TTS_LANG = 'id'; // Bahasa Indonesia

    // --- Fungsi Bantuan ---

    function createButton(text, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.style.marginLeft = '8px';
        btn.style.padding = '2px 8px';
        btn.style.fontSize = '12px';
        btn.style.border = '1px solid #007bff';
        btn.style.backgroundColor = '#e6f7ff';
        btn.style.color = '#007bff';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.flexShrink = '0';
        btn.onclick = (e) => {
            e.stopPropagation();
            onClick(e);
        };
        return btn;
    }

    function getPanggilan(jk, usiaText) {
        const age = parseInt(usiaText, 10);
        if (isNaN(age) || age < 0) { return 'Pasien'; }

        const lowerGender = jk.toLowerCase();
        if (age < 12) return 'Anak';
        if (age >= 12 && age <= 25) return lowerGender === 'l' ? 'Mas' : 'Mbak';
        if (age > 25) return lowerGender === 'l' ? 'Bapak' : 'Ibu';

        return 'Pasien';
    }

    // --- TTS Google Translate ---
    function playGoogleTTS(text, button) {
        try {
            const originalText = button ? button.textContent : '';
            if (button) { button.textContent = '...'; button.disabled = true; }

            // Endpoint publik Google Translate TTS
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${TTS_LANG}&client=tw-ob`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: ttsUrl,
                headers: { 'Referer': 'https://translate.google.com/' },
                responseType: 'arraybuffer',
                onload: function(res) {
                    try {
                        const audioData = res.response; // ArrayBuffer
                        const blob = new Blob([audioData], { type: 'audio/mpeg' });
                        const audioUrl = URL.createObjectURL(blob);
                        const audio = new Audio(audioUrl);
                        audio.play();
                        audio.onended = () => {
                            URL.revokeObjectURL(audioUrl);
                            if (button) { button.textContent = originalText; button.disabled = false; }
                        };
                    } catch (e) {
                        console.error('TTS Google: gagal memutar audio', e);
                        if (button) { button.textContent = originalText; button.disabled = false; }
                    }
                },
                onerror: function(err) {
                    console.error('TTS Google: network error', err);
                    if (button) { button.textContent = originalText; button.disabled = false; }
                }
            });
        } catch (error) {
            console.error('TTS Google Error:', error);
        }
    }

    // --- Fungsi Pemutar Audio ---

    function playGeneralTTS() {
        try {
            const audioUrl = 'https://ia800402.us.archive.org/6/items/pasienselanjutnyasilakanmasuk/pasienselanjutnyasilakanmasuk.mp3';
            const audio = new Audio(audioUrl);
            audio.play();
        } catch (error) {
            console.error("TTS Script Error (Umum):", error);
            alert("Gagal memutar audio umum.");
        }
    }

    // Hapus Gemini TTS: diganti dengan playGoogleTTS di atas

    // --- Logika Utama (Menambahkan Tombol) ---

    let hasLoggedNotFound = false;

    function addButtonsToPatientHeader() {
        const namaEl = document.getElementById('txt_PatientName_Header');
        const jkEl = document.getElementById('txt_Gender_Header');
        const usiaEl = document.getElementById('txt_Age_Header');

        if (!namaEl || !jkEl || !usiaEl) {
            if (!hasLoggedNotFound) {
                console.log("TTS Script: Menunggu elemen header pasien (nama, jk, usia)...");
                hasLoggedNotFound = true;
            }
            return;
        }

        const targetElement = namaEl.parentElement;

        if (!targetElement || targetElement.classList.contains('tts-processed')) {
            return;
        }

        console.log("TTS Script: Elemen header DITEMUKAN. Memproses...");
        hasLoggedNotFound = false;

        const nama = namaEl.textContent.replace('Nama :', '').replace(',', '').trim();
        const jk = jkEl.textContent.replace('JK:', '').replace(',', '').trim();
        const usia = usiaEl.textContent.replace('Usia :', '').replace(',', '').trim();

        if (nama && jk && usia) {
            const generalBtn = createButton('Panggil (Umum)', playGeneralTTS);
            generalBtn.style.borderColor = '#28a745';
            generalBtn.style.backgroundColor = '#f6ffed';
            generalBtn.style.color = '#28a745';

            const geminiBtn = createButton(`Panggil ${nama}`, (e) => {
                const panggilan = getPanggilan(jk, usia);
                const textToSpeak = `${panggilan} ${nama}, Silahkan masuk ruang periksa`;
                playGoogleTTS(textToSpeak, e.target);
            });
            geminiBtn.style.borderColor = '#007bff';
            geminiBtn.style.backgroundColor = '#e6f7ff';
            geminiBtn.style.color = '#007bff';

            targetElement.style.display = 'flex';
            targetElement.style.alignItems = 'center';
            targetElement.style.flexWrap = 'wrap';

            targetElement.appendChild(geminiBtn);
            targetElement.appendChild(generalBtn);

            targetElement.classList.add('tts-processed');
            console.log("TTS Script: Tombol berhasil ditambahkan.");
        } else {
            console.log("TTS Script: Gagal mengekstrak nama/jk/usia dari header.");
        }
    }

    // --- Observer untuk Konten Dinamis ---

    const bodyObserver = new MutationObserver((mutations, obs) => {
        addButtonsToPatientHeader();
    });

    console.log("TTS Script: bodyObserver mulai mengamati perubahan...");
    bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    // --- WA NOTIFICATION ON SAVE (Pelayanan) ---
    // Mengirim pesan WA ketika tombol #idButtonSave diklik
    const WA_API_URL = "https://wabot.dokterizza.my.id/send";
    const WA_TARGET_GROUP = "120363423716715740@g.us";

    function getPatientNameHeader() {
        const el = document.getElementById('txt_PatientName_Header');
        if (!el) return null;
        const raw = (el.textContent || el.innerText || '').trim();
        // Expect format: "Nama : SITI NUR ROHMAH" -> extract after ':'
        const parts = raw.split(':');
        if (parts.length >= 2) return parts.slice(1).join(':').trim();
        // fallback: remove leading 'Nama' words
        return raw.replace(/^Nama\s*[:\-]?\s*/i, '').trim();
    }

    function sendPelayananWA(patientName, callback) {
        const prefix = '[Pelayanan WA]';
        const message = `pelayanan medis ${patientName} sudah selesai, mohon siapkan obat`;
        console.log(prefix, 'Sending message:', message);

        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: WA_API_URL,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ to: WA_TARGET_GROUP, message: message }),
                anonymous: true,
                timeout: 5000,
                onload: function(res) {
                    console.log(prefix, 'onload status=', res.status, 'response=', res.responseText);
                    if (res.status >= 200 && res.status < 300) {
                        console.log(prefix, '✅ Sent successfully');
                    } else {
                        console.error(prefix, '❌ Failed to send', res.status, res.statusText, res.responseText);
                    }
                    // Panggil callback setelah selesai (sukses atau gagal)
                    if (callback) callback();
                },
                onerror: function(err) {
                    console.error(prefix, 'Network error', err);
                    // Panggil callback meskipun error
                    if (callback) callback();
                },
                ontimeout: function() {
                    console.error(prefix, 'Timeout while sending WA');
                    // Panggil callback jika timeout
                    if (callback) callback();
                }
            });
        } catch (e) {
            console.error(prefix, 'Exception sending WA', e);
            // Panggil callback jika exception
            if (callback) callback();
        }
    }

    // Validasi halaman: breadcrumb harus [Pelayanan, Rawat Jalan, Pelayanan Medis, Tambah]
    function isValidPelayananAddPage() {
        try {
            const ol = document.querySelector('ol.breadcrumb');
            if (!ol) return false;
            const items = Array.from(ol.querySelectorAll('li')).map(li => li.textContent.trim());
            return items.length >= 4 &&
                items[0] === 'Pelayanan' &&
                items[1] === 'Rawat Jalan' &&
                items[2] === 'Pelayanan Medis' &&
                items[3] === 'Tambah';
        } catch (e) {
            return false;
        }
    }

    // --- Global Lock Variable ---
    let isGlobalSendingPelayanan = false;
    let waAlreadySent = false; // Flag untuk tracking apakah WA sudah dikirim

    function hookSaveButtonPelayanan() {
        // Hanya hook jika halaman valid (breadcrumb sesuai)
        if (!isValidPelayananAddPage()) {
            // clear marker so it can be hooked later when page becomes valid
            const existing = document.getElementById('idButtonSave');
            if (existing) {
                existing.removeAttribute('data-pelayanan-wa');
                waAlreadySent = false; // Reset flag
            }
            return;
        }

        const btn = document.getElementById('idButtonSave');
        if (!btn) return;
        if (btn.getAttribute('data-pelayanan-wa') === 'yes') return;
        
        // STRATEGI BARU: Delay event asli, kirim WA di background, lanjutkan otomatis
        btn.addEventListener('click', function(evt) {
            try {
                if (!isValidPelayananAddPage()) {
                    console.log('[Pelayanan WA] Click ignored: not on Pelayanan Add page');
                    return;
                }

                // Jika WA sudah dikirim, biarkan event berjalan normal
                if (waAlreadySent) {
                    console.log('[Pelayanan WA] WA sudah terkirim sebelumnya, lanjutkan save...');
                    waAlreadySent = false; // Reset untuk next time
                    return; // Biarkan event asli jalan
                }

                // Cek global lock
                if (isGlobalSendingPelayanan) {
                    console.warn("⚠️ Pelayanan: Sedang mengirim WA, tunggu...");
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }

                const name = getPatientNameHeader() || '-';
                if (!name || name === '-') {
                    console.log('[Pelayanan WA] Nama pasien kosong, lanjutkan save normal');
                    return; // Biarkan proses save normal jalan
                }

                // BLOKIR event hanya untuk click pertama (untuk delay)
                evt.preventDefault();
                evt.stopPropagation();

                // Aktifkan lock
                isGlobalSendingPelayanan = true;

                console.log('[Pelayanan WA] Mengirim WA terlebih dahulu...');

                // Kirim WA tanpa blocking (fire and forget dengan timeout singkat)
                sendPelayananWA(name, function() {
                    console.log('✅ Pelayanan WA selesai dikirim');
                    waAlreadySent = true; // Set flag bahwa WA sudah terkirim
                    isGlobalSendingPelayanan = false;
                    
                    // Trigger klik ulang setelah WA terkirim
                    console.log('[Pelayanan WA] Melanjutkan proses save...');
                    setTimeout(() => {
                        btn.click(); // Klik ulang, kali ini akan lolos karena waAlreadySent = true
                    }, 100);
                });

            } catch (e) { 
                console.error('[Pelayanan WA] handler error', e);
                isGlobalSendingPelayanan = false;
                waAlreadySent = false;
            }
        }, true);
        btn.setAttribute('data-pelayanan-wa', 'yes');
        console.log('[Pelayanan WA] Hooked #idButtonSave');
    }

    // Try to hook immediately and periodically (in case button is injected later)
    hookSaveButtonPelayanan();
    setInterval(hookSaveButtonPelayanan, 1000);
})();