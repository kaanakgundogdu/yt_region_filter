# YT Region Filter: Chrome Extension (Manifest V3)

YouTube izleme sayfasındaki "sıradaki / önerilen" listesinde, izlenen videoyla ilgisi olmayan **bölgesel (Türkçe) önerileri** gizleyen küçük bir pilot extension. Düz JS kullanılır; framework, bundler ve build adımı yoktur.

## Problem tanımı (netleştirilmiş)
- Ana sayfa önerileri zaten kapalı. Sorun **izleme sayfasının sağ panelinde** (ve video sonu ekranında) çıkan Türkiye kaynaklı (çoğunlukla siyasi) videolar.
- Videoyla ilgili öneriler faydalı, bunlar kalmalı. Yalnızca **bağlam dışı bölgesel** öneriler gitmeli.

## Onaylanan kararlar (2026-10-12)
1. **Yaklaşım:** Uyarlanmış B uygulanacak, A elendi. Hesabın bölgesi zaten AU olduğu hâlde Türkçe öneriler geliyor. Bu da sinyalin gl değil IP/hesap kaynaklı olduğunu doğruluyor.
2. **Kapsam:** Pilotta yalnızca izleme sayfasının sağ paneli (dar ekranda video altına düşen aynı liste) filtrelenir. Video sonu ekranı ve Shorts pilot sonrasına bırakıldı (DUR-6).
3. **Bağlam kuralı:** Açık. İzlenen video Türkçeyse Türkçe öneriler gösterilir.
4. **Mod:** Varsayılan **gizle**. Geliştirme sırasında debug modu (soluklaştırma + dil etiketi) açık olur. DUR-4'te kapatılır.
5. **Hedef dil:** Yalnızca Türkçe. Kanal beyaz listesi pilotta yok.
6. **Popup:** Minimal tutulur (açık/kapalı, mod, gizlenen sayısı). K6 kartında yapılır.
7. **DOM inceleme:** Claude, yerleşik tarayıcıda oturum açmadan YouTube izleme sayfasını inceler (kart yapısı hesaptan bağımsızdır). Bu yeterli olmazsa kullanıcıdan `outerHTML` istenir.
8. **Git:** Depo `git init` ile başlatıldı.

**Referans örnek (kullanıcı ekran görüntüsü):** İngilizce *"One Piece Chapter 1195 Review"* videosu izlenirken sağ panelde *"TÜRKİYE'NİN KONUŞTUĞU TEĞMENLER İLK KEZ ..."* (kanal: Onlar) çıkıyor. Bu kart gizlenmeli. Aynı paneldeki İngilizce anime ve manga önerileri kalmalı.
- Başlık **tamamen büyük harf** ve `İ`, `Ğ` içeriyor. Karakter sezgisi büyük harfleri doğrudan regex ile yakalamalı (`/[ıİğĞşŞ]/`). `toLowerCase()` kullanılmamalı, çünkü `İ` → `i̇` (birleşik nokta) olur.
- Başlık "…" ile kesilmiş olabilir. Mümkünse `title` / `aria-label` özniteliğindeki tam başlık kullanılır.

**Not edilen alternatif C:** Panelin üstündeki YouTube'un kendi **"Related"** çipini otomatik seçmek. Basit görünüyor ama bölgesel önerileri garanti biçimde dışlamıyor ve çip DOM'u da kırılgan. Pilotta yok, K7 sonrası tekrar değerlendirilebilir.

## Seçilen yaklaşım: B'nin uyarlanmış hâli (A elendi)

**A) gl/hl zorlama (URL / PREF cookie): ELENDİ.**
- Kullanıcı bölgeyi zaten değiştirdi; PREF cookie'si bu ayarı zaten taşıyor ve sorun çözülmedi. Öneri motoru ağırlıklı olarak **IP konumu ve hesap sinyallerini** kullanıyor. gl daha çok trend sayfası ve arayüz dilini etkiliyor.
- İzleme önerileri `youtubei/v1/next` isteğinin JSON gövdesindeki `context.client.gl` ile geliyor. Bunu değiştirmek fetch/XHR enjeksiyonu (MAIN world) gerektirir. Bu kırılgan ve invaziv, etkisi de belirsiz (IP yine baskın).
- URL yönlendirmesi (declarativeNetRequest) SPA gezinmesinde devreye girmez ve yönlendirme döngüsü riski taşır.

**B) Kart başlığı dil tespiti + gizleme: SEÇİLDİ, iki değişiklikle:**
1. **Hedef ana sayfa değil, izleme sayfası** (sağ panel, gerekirse video sonu ekranı). Ana sayfa zaten kapalı.
2. **Bağlam kuralı:** İzlenen videonun başlığı da hedef dildeyse (Türkçe bir video izleniyorsa) Türkçe öneriler **gizlenmez**. Böylece "ilgili öneri faydalı" şartı korunur.

Dil tespiti iki katmanlıdır:
- `chrome.i18n.detectLanguage` (CLD), content script içinde izin gerektirmeden kullanılabilir.
- Kısa başlıklarda CLD güvenilmez. Bu yüzden ucuz bir yedek kullanılır: **Türkçeye özgü karakterler** (`ı İ ğ Ğ ş Ş`) ve isteğe bağlı küçük bir Türkçe stopword listesi (`ve, bir, için, neden, nasıl...`). Sonuçlar başlık metnine göre önbelleğe alınır.

**A+B birleşimi:** Mantıklı değil. A'nın getirisi belirsiz, riski yüksek. Pilot bittikten sonra, B yetersiz kalırsa A ayrı bir deney kartı olarak değerlendirilir (bkz. K8).

**Not edilen alternatif (pilot dışı):** `ytInitialData` / `youtubei/v1/next` yanıtını MAIN world'de yakalayıp öğeleri render edilmeden önce filtrelemek. CSS değişikliklerine daha dayanıklı ama veri şeması değişikliklerine karşı kırılgan ve daha invaziv. Ancak DOM yaklaşımı sürdürülemez hâle gelirse düşünülür.

## Kırılgan noktalar ve önlemler
| Risk | Önlem |
|---|---|
| YouTube DOM'u sık değişiyor. Sağ panel `ytd-compact-video-renderer` yapısından yeni `yt-lockup-view-model` yapısına geçti. İkisi bir arada görülebilir. | Tüm seçiciler **tek dosyada** (`selectors.js`) tutulur ve her iki yapı da desteklenir. Seçici bozulursa sadece bu dosya düzeltilir. |
| SPA gezinmesi: sayfa yeniden yüklenmez. | `yt-navigate-finish` olayı dinlenir ve bağlam (izlenen video dili) yeniden hesaplanır. |
| YouTube kart DOM düğümlerini **yeniden kullanır** (başlık değişir, element aynı kalır). | Karar `data-ytrf-title` ile hangi başlık için verildiyse işaretlenir. Başlık değişince yeniden değerlendirilir. |
| Sonsuz kaydırma / gecikmeli yükleme | Panel kapsayıcısında `MutationObserver` kullanılır, callback debounce edilir (~100 ms). |
| Kısa ve karışık dilli başlıklar yanlış tespit edilir. | Karakter sezgisi + eşik değeri. Debug modunda gizlemek yerine **soluklaştırma ve dil etiketi** gösterilerek ayar yapılır. |
| Elementi silmek YouTube'un kendi kodunu bozabilir. | Element **silinmez**, CSS sınıfıyla (`display:none`) gizlenir. |

## Klasör yapısı
```
yt_region_filter/
├── CLAUDE.md
├── manifest.json          # MV3; izinler: "storage" + youtube.com host eşleşmesi
├── src/                   # content script'ler manifest'teki sırayla yüklenir (aynı izole dünya)
│   ├── selectors.js       # TÜM DOM seçicileri burada
│   ├── detect.js          # dil tespiti: saf, senkron, DOM/chrome API'sine bağımlı değil
│   ├── content.js         # tarama, karar, gizleme, MutationObserver, SPA gezinme, ayarlar
│   ├── content.css        # .ytrf-hidden / .ytrf-dim / debug etiketi
│   └── popup/
│       ├── popup.html     # aç/kapa, mod (gizle/soluklaştır), gizlenen sayısı
│       ├── popup.css
│       └── popup.js
├── tests/
│   └── detect.test.html   # tarayıcıda açılır, detect.js'i yükleyip PASS/FAIL listeler
└── icons/                 # (isteğe bağlı) 16/48/128 px
```
> Yükleme sırası: `selectors.js` → `detect.js` → `content.js`. Ortak ad alanı `globalThis.YTRF` olarak kullanılır.

## Sözleşme
Ajanlar bu bölümü değiştirmez. Değişiklik gerekiyorsa raporlar, ana oturum günceller.

### `detect.js` arayüzü
```js
// globalThis.YTRF.detect
turkishScore(title: string) -> number   // 0.0–1.0, saf ve senkron, aynı girdi → aynı çıktı
isTurkish(title: string, threshold = 0.5) -> boolean   // turkishScore(title) >= threshold
```
- **Neden skor + boolean:** `content.js` yalnızca `isTurkish` kullanır. Skor ise debug etiketinde gösterilir ve K7'de eşik ayarlamak için gerekir.
- **Senkron ve saf:** MutationObserver içinde her kart için çağrılır. Bu yüzden `chrome.i18n.detectLanguage` (asenkron) bu sürümde **kullanılmaz**. Sezgi yetersiz kalırsa CLD, K7'de gri bölge (≈0.3–0.7) için asenkron ek katman olarak değerlendirilir.
- **Sezgi:** `ı İ ğ Ğ ş Ş` güçlü sinyaldir. `ç ö ü Ç Ö Ü` zayıf sinyaldir (Almanca ve Fransızcada da geçer). Küçük bir Türkçe stopword listesi kullanılır, eşleşme **Türkçe locale ile** küçültme yapıldıktan sonra kelime bazında yapılır (`toLocaleLowerCase('tr')`). Karakter testi ise ham metin üzerinde regex ile yapılır.
- **Kenar durumlar:** Boş veya null girdi `0` döner. Kesik başlık ("…" ile biten) normal işlenir. Emoji ve noktalama skoru etkilemez.
- **Önbellek:** Başlık metnine göre `Map`, üst sınır ~2000 kayıt (aşılınca temizlenir).
- **Dışa aktarım:** `globalThis.YTRF = globalThis.YTRF || {}; YTRF.detect = { turkishScore, isTurkish };`. ES modülü ve `module.exports` kullanılmaz.

### `chrome.storage` anahtarları
| Anahtar | Alan | Tip / Varsayılan | Yazan | Okuyan |
|---|---|---|---|---|
| `enabled` | `sync` | `boolean` / `true` | popup | content |
| `mode` | `sync` | `'hide' \| 'dim'` / `'hide'` | popup | content |
| `debug` | `sync` | `boolean` / `false` | (şimdilik elle ya da DevTools'tan) | content |
| `hiddenCount` | `local` | `number` / `0` | content | popup |

- `hiddenCount`: **Son aktif izleme sayfasında** gizlenen kart sayısıdır. SPA gezinmesinde `0`'a sıfırlanır. Content, yazmaları ~500 ms debounce ile yapar. `sync` yerine `local` kullanılır, çünkü `sync` alanında dakika başına yazma kotası vardır. Birden fazla YouTube sekmesi açıksa son yazan kazanır, pilotta kabul edilen bir sınırlamadır.
- Varsayılanlar her okumada `chrome.storage.sync.get({enabled: true, mode: 'hide', debug: false})` ile verilir. Kurulumda ayrıca yazılmaz.
- Değişiklikler `chrome.storage.onChanged` ile canlı izlenir. Popup sayacı ve content ayarları sayfa yenilemeden güncellenir.
- Mod `dim` olduğunda gizlenen kartlar da `hiddenCount`'a sayılır.

### Dosya sahipliği
| Dosya | Sahibi |
|---|---|
| `CLAUDE.md`, `manifest.json` | Ana oturum (yalnızca) |
| `src/selectors.js`, `src/content.js`, `src/content.css` | Ana oturum |
| `src/detect.js`, `tests/detect.test.html` | Ajan A |
| `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js` | Ajan B |

Ajan kuralları: Ajanlar yalnızca kendi dosyalarına yazar. Başka bir dosyada değişiklik gerekiyorsa değişikliği yapmaz, raporlar. Commit atmaz. Aynı hatada 2 başarısız denemeden sonra durur ve raporlar. Bitince 3 satırlık rapor verir: ne yapıldı, nasıl test edildi, açık kalan ne.
> C++ benzetmesi: `content_scripts.js` dizisi, dosyaların sırayla tek bir translation unit'te birleştirilmesi gibidir. ES modülü veya import yoktur, sıralama önemlidir.

## Kart tablosu
| Kart | İş | Model | Durum / Bağımlılık |
|---|---|---|---|
| K0 | Yaklaşım değerlendirmesi, plan, CLAUDE.md | Opus | ✅ Bitti |
| K1 | `manifest.json` + boş content script iskeleti (youtube.com'da console log) | Haiku | Hazır · K0 onaylandı |
| K2 | `selectors.js`: sağ panel kartı (eski ve yeni yapı), başlık ve kanal adı çıkarma, izlenen video başlığı | Sonnet | Bekliyor · K1 + yerleşik tarayıcıda DOM incelemesi (DUR-2) |
| K3 | `detect.js`: karakter sezgisi + stopword + önbellek, `tests/detect.test.html` | Sonnet (Ajan A) | Bekliyor · Sözleşme onayı |
| K4 | `content.js`: observer, debounce, yeniden kullanılan düğüm, SPA gezinme, debug modu | Sonnet (Opus gözden geçirir) | Bekliyor · K2, K3 |
| K5 | Bağlam kuralı: izlenen video Türkçeyse Türkçe öneriler gizlenmez | Sonnet | Bekliyor · K4 |
| K6 | Popup: Sözleşme'deki storage anahtarlarına göre | Sonnet (Ajan B) | Bekliyor · Sözleşme onayı (K4'ten bağımsız) |
| K7 | Manuel test ve eşik ayarı (gerçek kullanımda 1–2 gün) | Kullanıcı + Sonnet | Bekliyor · K5, K6 |
| K8 | (İsteğe bağlı) A deneyi: gl/IP etkisinin ölçülmesi | Opus karar verir | Sadece B yetersizse · DUR-5 |

## DUR noktaları (kullanıcı onayı gerekir)
- **DUR-1:** K1 sonrası: extension "paketlenmemiş" yüklendi ve YouTube sekmesi konsolunda log görüldü mü?
- **DUR-2:** K2 öncesi: seçiciler tahminle yazılmaz. Önce yerleşik tarayıcıda (oturum açmadan) DOM incelenir ve bulunan seçiciler kullanıcıya özetlenir. İnceleme yetersiz kalırsa kullanıcıdan bir kartın `outerHTML`'i istenir (DevTools → sağ tık → Copy → Copy outerHTML).
- **DUR-3:** `storage` dışında **herhangi bir yeni izin**, MAIN world enjeksiyonu, ağ isteği yakalama veya `declarativeNetRequest` eklenmeden önce.
- **DUR-4:** K4 sonrası: debug modunda (soluklaştırma + etiket) yanlış pozitifler ve negatifler birlikte gözden geçirilir. Ardından varsayılan mod seçilir.
- **DUR-5:** K8 (A yaklaşımı) başlatılmadan önce.
- **DUR-6:** Kapsam genişletilmeden önce (ana sayfa, Shorts, arama sonuçları, video sonu ekranı).

## Çalışma kuralları
- **Aynı hatada 2 denemeden sonra DUR.** Denenenleri, gözlenen davranışı ve hipotezleri kısaca özetle, **Opus'a dönülmesini öner**. Körlemesine üçüncü bir deneme yapma.
- Seçiciler yalnızca `selectors.js` içinde tutulur. Başka dosyada sabit seçici yazılmaz.
- Framework, npm ve build adımı kullanılmaz. Düz JS (ES2020+), Chrome'un en son sürümü hedeflenir.
- Elementler silinmez, yalnızca sınıf eklenip kaldırılır.
- Loglar `[ytrf]` önekiyle yazılır ve ayarlardaki `debug` bayrağına bağlıdır.
- Kod Türkçe yorum içerebilir, tanımlayıcılar İngilizce yazılır.

## Test yöntemi
1. `chrome://extensions` adresini aç → sağ üstte **Geliştirici modu**nu aç.
2. **Paketlenmemiş öğe yükle** → bu klasörü (`manifest.json`'un bulunduğu kök) seç.
3. Kod değişince extension kartındaki **↻ (yeniden yükle)** düğmesine bas, ardından **YouTube sekmesini yenile** (content script'ler ancak sayfa yenilenince yeniden enjekte edilir).
4. Loglar: YouTube sekmesinde DevTools → Console. Gerekirse bağlam açılır listesinden extension'ın izole dünyasını seç. Popup logları için popup'a sağ tıkla → İncele.
5. Hatalar: `chrome://extensions` → extension kartı → **Hatalar** düğmesi.

**Senaryo kontrol listesi:**
- [ ] İngilizce bir video izlenirken sağ paneldeki Türkçe öneriler gizleniyor.
- [ ] Türkçe bir video izlenirken Türkçe öneriler görünüyor (bağlam kuralı).
- [ ] Panel aşağı kaydırılınca yeni yüklenen kartlar da filtreleniyor.
- [ ] Videodan videoya (SPA) geçince bağlam güncelleniyor, eski karar takılı kalmıyor.
- [ ] Extension kapatılınca (popup) tüm kartlar geri geliyor.
- [ ] Debug modunda her kartta tespit edilen dil etiketi görünüyor.
