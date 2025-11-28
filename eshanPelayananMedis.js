// ==UserScript==
// @name         TTS Panggilan Pasien (Gemini API) - Halaman Medis
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Menambahkan tombol panggil TTS (menggunakan logika PCM-ke-WAV).
// @author       Gemini
// @match        https://id1-eshan.co.id/pmim/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      generativelanguage.googleapis.com
// @connect      192.168.1.10
// @connect      192.168.1.10:5001
// ==/UserScript==

(function() {
    'use strict';

    console.log("TTS Script v2.5 (PCM-ke-WAV): Dimulai.");

    // --- Konfigurasi dan Setup API Key ---

    GM_registerMenuCommand("Atur Gemini API Key", setApiKey);

    async function setApiKey() {
        let currentKey = await GM_getValue('geminiApiKey', '');
        let newKey = prompt("Masukkan Google AI (Gemini) API Key Anda:", currentKey);
        if (newKey !== null) {
            await GM_setValue('geminiApiKey', newKey);
            alert("API Key telah disimpan.");
        }
    }

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

    // --- FUNGSI BARU (dari logika web app Anda) ---

    // 1. Dekoder Base64 ke ArrayBuffer
    function decodeBase64(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // 2. Konverter PCM mentah ke WAV Blob
    function pcmToWavBlob(pcmData, sampleRate) {
        const numSamples = pcmData.length;
        const numChannels = 1;
        const bytesPerSample = 2; // 16-bit PCM
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = numSamples * blockAlign;
        const waveSize = 36 + dataSize;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
    // No-op placeholder to ensure context alignment
    hookSaveButtonPelayanan();
    // No-op placeholder to ensure context alignment
        // Header RIFF ("RIFF")
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, waveSize, true);
        // ("WAVE")
        view.setUint32(8, 0x57415645, false);
        // "fmt " chunk
        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true); // Ukuran sub-chunk
        view.setUint16(20, 1, true); // Format audio (1=PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bytesPerSample * 8, true); // Bits per sample
        // "data" chunk
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, dataSize, true);

        // Tulis data PCM
        for (let i = 0; i < numSamples; i++) {
            view.setInt16(44 + i * 2, pcmData[i], true);
        }

        return new Blob([buffer], { type: 'audio/wav' });
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

    async function playGeminiTTS(text, button) {
        const apiKey = await GM_getValue('geminiApiKey', null);
        if (!apiKey) {
            alert("API Key Gemini belum diatur. Silakan atur melalui menu Tampermonkey.");
            return;
        }

        const originalText = button.textContent;
        button.textContent = '...';
        button.disabled = true;

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

        // =================================================================
        // === PERBAIKAN UTAMA (v2.5) ===
        // 'audioEncoding' DIHAPUS agar API mengembalikan PCM
        // =================================================================
        const payload = {
            contents: [{
                parts: [{ text: text }]
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
                }
                // 'audioEncoding: "MP3"' Dihapus
            }
        };
        // =================================================================

        GM_xmlhttpRequest({
            method: "POST",
            url: API_URL,
            headers: { "ContentType": "application/json" },
            data: JSON.stringify(payload),
            responseType: 'json',
            onload: function(response) {
                try {
                    if (response.response && response.response.error) {
                        console.error("Gemini TTS Error (API):", response.response);
                        let errorMsg = response.response.error.message || "Error tidak diketahui.";
                        alert(`Gagal menghasilkan audio (Error: ${response.response.error.code}).\n\nPESAN: ${errorMsg}`);
                        button.textContent = originalText;
                        button.disabled = false;
                        return;
                    }

                    // === LOGIKA BARU v2.5 ===
                    const audioDataPart = response.response.candidates[0].content.parts[0];

                    if (audioDataPart.inlineData && audioDataPart.inlineData.data) {
                        const base64Audio = audioDataPart.inlineData.data; // Ini Base64 PCM
                        const mimeType = audioDataPart.inlineData.mimeType; // cth: 'audio/L16;rate=24000'

                        // Ekstrak sample rate dari mimeType
                        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
                        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000; // Default 24kHz

                        // 1. Decode Base64 ke ArrayBuffer
                        const pcmDataBuffer = decodeBase64(base64Audio);
                        // 2. Konversi buffer ke Int16Array
                        const pcm16 = new Int16Array(pcmDataBuffer);
                        // 3. Buat file WAV dari data PCM
                        const wavBlob = pcmToWavBlob(pcm16, sampleRate);
                        // 4. Buat URL yang bisa diputar
                        const audioUrl = URL.createObjectURL(wavBlob);

                        const audio = new Audio(audioUrl);
                        audio.play();
                        audio.onended = () => {
                            button.textContent = originalText;
                            button.disabled = false;
                            URL.revokeObjectURL(audioUrl); // Hapus URL setelah selesai
                        };
                    } else {
                        console.error("Gemini TTS Error (Invalid Data):", response.response);
                        alert("Gagal menghasilkan audio: Data audio tidak valid dari API.");
                        button.textContent = originalText;
                        button.disabled = false;
                    }
                } catch (e) {
                    console.error("Gemini TTS Error (Parsing Sukses):", e, response.response);
                    alert(`Gagal memproses audio (Error: ${e.message}). Cek console.`);
                    button.textContent = originalText;
                    button.disabled = false;
                }
            },
            onerror: function(error) {
                console.error("Gemini TTS Request Error (Network):", error);
                alert("Gagal terhubung ke API Gemini TTS.");
                button.textContent = originalText;
                button.disabled = false;
            }
        });
    }

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
                playGeminiTTS(textToSpeak, e.target);
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
    const WA_API_URL = "http://192.168.1.10:5001/send-message";
    const WA_API_KEY = "Paracetamol!500mg";
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

    function sendPelayananWA(patientName) {
        const prefix = '[Pelayanan WA]';
        const message = `pelayanan medis ${patientName} sudah selesai, mohon siapkan obat`;
        console.log(prefix, 'Sending message:', message);

        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: WA_API_URL,
                headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
                data: JSON.stringify({ jid: WA_TARGET_GROUP, message: message }),
                anonymous: true,
                timeout: 10000,
                onload: function(res) {
                    console.log(prefix, 'onload status=', res.status, 'response=', res.responseText);
                    if (res.status >= 200 && res.status < 300) {
                        console.log(prefix, '✅ Sent successfully');
                    } else {
                        console.error(prefix, '❌ Failed to send', res.status, res.statusText, res.responseText);
                    }
                },
                onerror: function(err) {
                    console.error(prefix, 'Network error', err);
                },
                ontimeout: function() {
                    console.error(prefix, 'Timeout while sending WA');
                }
            });
        } catch (e) {
            console.error(prefix, 'Exception sending WA', e);
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

    function hookSaveButtonPelayanan() {
        // Hanya hook jika halaman valid (breadcrumb sesuai)
        if (!isValidPelayananAddPage()) {
            // clear marker so it can be hooked later when page becomes valid
            const existing = document.getElementById('idButtonSave');
            if (existing) existing.removeAttribute('data-pelayanan-wa');
            return;
        }

        const btn = document.getElementById('idButtonSave');
        if (!btn) return;
        if (btn.getAttribute('data-pelayanan-wa') === 'yes') return;
        btn.addEventListener('click', function(evt) {
            try {
                if (!isValidPelayananAddPage()) {
                    console.log('[Pelayanan WA] Click ignored: not on Pelayanan Add page');
                    return;
                }
                const name = getPatientNameHeader() || '-';
                sendPelayananWA(name);
            } catch (e) { console.error('[Pelayanan WA] handler error', e); }
        });
        btn.setAttribute('data-pelayanan-wa', 'yes');
        console.log('[Pelayanan WA] Hooked #idButtonSave');
    }

    // Try to hook immediately and periodically (in case button is injected later)
    hookSaveButtonPelayanan();
    setInterval(hookSaveButtonPelayanan, 1000);
})();