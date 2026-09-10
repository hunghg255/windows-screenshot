import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, Copy, Crop, Keyboard, LockKeyhole, MousePointer2, MoveUpRight, Pencil, ScanLine, ShieldCheck, Smile } from 'lucide-react';
import './styles.css';
import { getTranslator, type Language, type Translator } from './i18n';

const GITHUB = 'https://github.com/hunghg255/windows-screenshot';
const DOWNLOAD = `${GITHUB}/releases`;
function Github({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .7a11.3 11.3 0 0 0-3.57 22.02c.57.1.77-.24.77-.54v-2.1c-3.15.68-3.82-1.34-3.82-1.34-.51-1.31-1.26-1.66-1.26-1.66-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.74 2.66 1.24 3.31.95.1-.74.39-1.24.72-1.53-2.51-.29-5.15-1.26-5.15-5.6 0-1.23.44-2.24 1.16-3.03-.12-.29-.5-1.43.11-2.99 0 0 .95-.3 3.11 1.16a10.8 10.8 0 0 1 5.66 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.56.23 2.7.12 2.99.72.79 1.16 1.8 1.16 3.03 0 4.35-2.65 5.31-5.17 5.59.41.35.77 1.04.77 2.1v3.11c0 .3.2.65.78.54A11.3 11.3 0 0 0 12 .7Z" /></svg>;
}
function DownloadLink({ small = false, t }: { small?: boolean; t: Translator }) {
  return <a className={`button primary${small ? ' small' : ''}`} href={DOWNLOAD} target="_blank" rel="noreferrer"><ArrowDownToLine size={18} />{small ? t("Tải miễn phí") : t("Tải cho Windows")}{!small && <ArrowUpRight size={17} />}</a>;
}

function App() {
  const [step, setStep] = useState(1);
  const [language, setLanguage] = useState<Language>('vi');
  const t = getTranslator(language);
  function changeLanguage(value: string) {
    if (value !== 'vi' && value !== 'en') return;
    setLanguage(value);
    const translate = getTranslator(value);
    document.documentElement.lang = value;
    document.title = translate('Screenshot — Chụp nhanh. Nói rõ.');
    document.querySelector('meta[name="description"]')?.setAttribute('content', translate('Screenshot cho Windows. Chụp màn hình, thêm ghi chú và lưu PNG. Miễn phí, mã nguồn mở, ảnh được xử lý ngay trên máy bạn.'));
  }
  const steps = [
  { title: t("Chụp màn hình"), short: t("Chụp"), text: t("Cả màn hình hay chỉ một vùng nhỏ. Bấm phím tắt, kéo chọn và bắt đầu."), icon: ScanLine },
  { title: t("Thêm điều muốn nói"), short: t("Ghi chú"), text: t("Mũi tên, chữ, hình vẽ và emoji. Làm mờ thông tin riêng tư trước khi chia sẻ."), icon: Pencil },
  { title: t("Sẵn sàng chia sẻ"), short: t("Lưu"), text: t("Copy vào clipboard hoặc lưu thành PNG. Mang ý tưởng đến cuộc trò chuyện tiếp theo."), icon: Copy },
];

const screenshots = [
  { title: t("Cài đặt"), src: './screenshots/settings.png', icon: Keyboard, alt: t("Cửa sổ Screenshot thật với lựa chọn màn hình, nút Full screen, Select region và phím tắt."), caption: t("Chọn màn hình cần chụp và đặt phím tắt theo thói quen của bạn.") },
  { title: t("Ghi chú"), src: './screenshots/editor.png', icon: Pencil, alt: t("Trình ghi chú thật với khung chữ nhật, mũi tên và chữ màu cam trên ảnh màn hình cài đặt."), caption: t("Khung chọn, mũi tên và văn bản được vẽ trực tiếp bằng các công cụ của app.") },
  { title: 'Emoji', src: './screenshots/emoji.png', icon: Smile, alt: t("Bảng chọn emoji đang mở trong trình ghi chú Screenshot trên Windows."), caption: t("Chọn emoji ngay trong trình ghi chú để thêm ngữ cảnh cho ảnh.") },
  { title: t('Chèn ảnh'), src: './screenshots/insert-image.png', icon: Pencil, alt: t('Ảnh được chèn và xoay với khung chọn và ô nhập W/H.'), caption: t('Chèn PNG, JPG/JPEG, SVG hoặc WebP; chỉnh W/H theo pixel và khóa tỷ lệ.') },
  { title: t('Xoay ảnh chụp'), src: './screenshots/rotate-screenshot.png', icon: Crop, alt: t('Ảnh chụp cùng ghi chú sau khi xoay 90° theo chiều kim đồng hồ.'), caption: t('Xoay toàn bộ ảnh và ghi chú 90° mỗi lần bấm; các đối tượng vẫn chỉnh sửa được.') },
];


  return <>
    <a className="skip-link" href="#main">{t("Đến nội dung chính")}</a>
    <header className="header wrap">
      <a href="#" className="brand" aria-label={t("Screenshot — Trang chủ")}><img src="./logo.png" alt="" width="36" height="36" />screenshot<span className="brand-dot">.</span></a>
      <nav aria-label={t("Điều hướng chính")}><a href="#features">{t("Tính năng")}</a><a href="#workflow">{t("Cách sử dụng")}</a><a href={GITHUB} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a></nav>
      <div className="header-actions">
        <select className="language-select" aria-label={t("Ngôn ngữ")} value={language} onChange={event => changeLanguage(event.target.value)}>
          <option value="vi" lang="vi">Tiếng Việt</option>
          <option value="en" lang="en">English</option>
        </select>
        <DownloadLink small t={t} />
      </div>
    </header>

    <main id="main">
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> {t("MỘT CÔNG CỤ NHỎ. ÍT THAO TÁC HƠN.")}</div>
          <h1>{t("Chụp nhanh.")}<br />{t("Nói")} <span className="accent-word">{t("rõ hơn.")}<svg viewBox="0 0 330 20" aria-hidden="true"><path d="M4 13 Q150 -2 325 9 M40 19 Q185 6 295 17" /></svg></span></h1>
          <p className="hero-description">{t("Một bức ảnh đáng giá ngàn lời.")}<br />{t("Thêm vài nét, để mọi người hiểu đúng ý bạn.")}</p>
          <div className="hero-actions"><DownloadLink t={t} /><a className="source-link" href={GITHUB} target="_blank" rel="noreferrer"><Github size={19} /> {t("Xem mã nguồn")} <ArrowUpRight size={15} /></a></div>
          <div className="hero-meta"><span><Check size={14} /> {t("Miễn phí & mã nguồn mở")}</span><span><span className="windows-icon" /> Windows x64</span></div>
        </div>
        <div className="hero-aside" aria-hidden="true"><div className="aside-icon"><Crop size={40} strokeWidth={1.2} /></div><span>{t("Ý tưởng rõ ràng.")}<br />{t("Chỉ cách một lần chụp.")}</span><svg viewBox="0 0 90 110"><path d="M15 5 Q80 5 60 90 M43 78 L60 96 L75 77" /></svg></div>
      </section>

      <section className="showcase wrap" aria-label={t("Ảnh chụp giao diện ứng dụng")}>
        <div className="showcase-top"><span><span className="status-dot" /> {t("SCREENSHOT TRÊN WINDOWS")}</span><span className="demo-label">{t("Ảnh chụp từ ứng dụng thật")} <ArrowDown size={13} /></span></div>
        <figure className="app-gallery">
          <a className="app-image-link" href={screenshots[step].src} target="_blank" rel="noreferrer" aria-label={t("Mở ảnh gốc: ") + screenshots[step].title}>
            <img className={'app-screenshot' + (step === 0 ? ' settings-screenshot' : '')} src={screenshots[step].src} alt={screenshots[step].alt} width={step === 0 ? 664 : 1184} height={step === 0 ? 561 : 811} fetchPriority="high" />
          </a>
          <figcaption aria-live="polite"><div><strong>{screenshots[step].title}</strong><p>{screenshots[step].caption}</p></div><a href={screenshots[step].src} target="_blank" rel="noreferrer">{t("Xem ảnh gốc")} <ArrowUpRight size={15} /></a></figcaption>
        </figure>
        <div className="demo-controls" role="group" aria-label={t("Chọn ảnh giao diện")}>{screenshots.map((item, index) => <button key={item.title} aria-pressed={step === index} onClick={() => setStep(index)}><span>0{index + 1}</span>{item.title}<item.icon size={15} /></button>)}</div>
      </section>

      <div className="benefit-strip wrap"><span><LockKeyhole size={17} /> {t("Xử lý ngay trên máy")}</span><span><Github size={17} /> {t("Mã nguồn mở")}</span><span><Keyboard size={17} /> {t("Phím tắt tùy chỉnh")}</span><span><Copy size={17} /> {t("Copy hoặc lưu PNG")}</span></div>

      <section className="editing wrap" aria-labelledby="editing-title">
        <div className="section-heading"><div><div className="eyebrow">{t('THÊM KHẢ NĂNG CHỈNH SỬA')}</div><h2 id="editing-title">{t('Chèn ảnh. Chỉnh đúng ý.')}</h2></div></div>
        <div className="feature-grid">
          <article className="feature-card capture-card"><div className="card-icon"><Pencil /></div><h3>{t('Chèn ảnh')}</h3><p>{t('Chèn PNG, JPG/JPEG, SVG hoặc WebP; chỉnh W/H theo pixel và khóa tỷ lệ.')}</p><p className="feature-detail">{t('Ảnh chèn là đối tượng riêng: di chuyển, đổi cỡ, xoay hoặc xóa. PNG xuất giữ vùng trong suốt. Ảnh động dùng khung hình đầu; SVG cần tĩnh và tự chứa tài nguyên.')}</p></article>
          <article className="feature-card annotate-card"><div className="card-icon"><MousePointer2 /></div><h3>{t('Di chuyển, đổi cỡ, xoay tự do.')}</h3><p>{t('Chọn và kéo đối tượng để di chuyển; dùng tám tay nắm để đổi cỡ. Giữ Shift khi kéo góc để giữ tỷ lệ; chữ và emoji luôn giữ tỷ lệ.')}</p><p className="feature-detail">{t('Mũi tên, hình chữ nhật, chữ, emoji và ảnh chèn hỗ trợ xoay 360°. Giữ Shift để chia góc 15°. Nét vẽ giữ độ dày khi đổi cỡ; dùng Size để chỉnh độ dày.')}</p></article>
          <article className="feature-card privacy-card"><div className="card-icon"><Crop /></div><h3>{t('Xoay ảnh chụp')}</h3><p>{t('Xoay toàn bộ ảnh và ghi chú 90° mỗi lần bấm; các đối tượng vẫn chỉnh sửa được.')}</p><p className="feature-detail">{t('Dùng nút Rotate screenshot trên thanh công cụ. Bốn lần bấm trở về hướng ban đầu. Copy và Save xuất đúng hướng đang xem ở độ phân giải gốc, không kèm khung chọn.')}</p></article>
        </div>
        <p className="editing-note">{t('Bút làm mờ chỉ tác động lên ảnh chụp gốc, không làm mờ ảnh chèn. Mỗi tệp nhập tối đa 20 MiB, 24 megapixel và 16.384 pixel mỗi cạnh.')}</p>
      </section>

      <section id="features" className="features wrap">
        <div className="section-heading"><div><div className="eyebrow">{t("ÍT THAO TÁC. NHIỀU Ý NGHĨA.")}</div><h2>{t("Đủ công cụ.")}<br />{t("Đúng lúc bạn cần.")}</h2></div><p>{t("Từ báo lỗi, góp ý thiết kế đến hướng dẫn đồng đội.")}<br />{t("Mọi thứ gói gọn trong một lần chụp.")}</p></div>
        <div className="feature-grid"><article className="feature-card capture-card"><div className="card-icon"><ScanLine /></div><h3>{t("Bắt trọn điều quan trọng.")}</h3><p>{t("Chụp toàn màn hình hoặc kéo chọn một vùng. Hỗ trợ chọn màn hình khi bạn làm việc với nhiều display.")}</p><div className="shortcut-visual"><kbd>Ctrl</kbd><span>+</span><kbd>Alt</kbd><span>+</span><kbd>R</kbd><MousePointer2 className="shortcut-pointer" size={27} /></div><span className="card-caption">{t("PHÍM TẮT CHỌN VÙNG MẶC ĐỊNH")}</span></article>
        <article className="feature-card annotate-card"><div className="card-icon"><Pencil /></div><h3>{t("Thêm nét. Thêm ngữ cảnh.")}</h3><p>{t("Mũi tên, hình khối, chữ và emoji. Làm mờ phần nhạy cảm, để người xem tập trung vào đúng chỗ.")}</p><div className="annotation-visual" aria-hidden="true"><span>Aa</span><MoveUpRight size={56} /><span className="blur-sample">private</span><span className="emoji-sample">✌️</span></div><span className="card-caption">{t("MỘT BỨC ẢNH, RÕ CẢ CÂU CHUYỆN")}</span></article>
        <article className="feature-card privacy-card"><div className="card-icon"><LockKeyhole /></div><h3>{t("Riêng tư từ thiết kế.")}</h3><p>{t("Ảnh nằm trong bộ nhớ cho đến khi bạn chọn copy hoặc lưu. Không tải ảnh lên máy chủ.")}</p><div className="privacy-visual"><div className="privacy-ring"><ShieldCheck size={44} strokeWidth={1.4} /></div><span><span className="status-dot" /> LOCAL BY DEFAULT</span></div></article></div>
      </section>

      <section id="workflow" className="workflow wrap"><div className="section-heading"><div><div className="eyebrow">{t("NHỊP LÀM VIỆC CỦA BẠN")}</div><h2>{t("Ba bước. Xong việc.")}</h2></div><a className="source-link" href="#download">{t("Bắt đầu ngay")} <ArrowRight size={18} /></a></div><div className="steps">{steps.map((item, index) => <article key={item.title}><span className="step-number">0{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>

      <section id="download" className="download-section wrap"><div className="download-art" aria-hidden="true"><Crop size={78} strokeWidth={1.2} /><span>✳</span></div><div className="eyebrow">{t("SẴN SÀNG KHI BẠN CẦN")}</div><h2>{t("Một lần chụp.")}<br />{t("Cả ý tưởng được truyền đi.")}</h2><p>{t("Nhẹ nhàng hơn cho quy trình làm việc hằng ngày của bạn.")}</p><DownloadLink t={t} /><span className="download-note">{t("Windows x64 · Miễn phí · Tải từ GitHub Releases")}</span><details><summary>{t("Cài đặt như thế nào?")}</summary><p>{t("Mở GitHub Releases, chọn bản phát hành và tải file")} <code>Screenshot-Setup-…-windows-x64.exe</code> {t("trong Assets. Chạy file để cài đặt. Bộ cài chưa ký số nên Windows có thể hiện cảnh báo nhà phát hành không xác định.")}</p></details></section>
    </main>
    <footer className="footer wrap"><a className="brand" href="#"><img src="./logo.png" alt="" width="28" height="28" />screenshot.</a><span>{t("Được tạo để ý tưởng rõ ràng hơn.")}</span><a href={GITHUB} target="_blank" rel="noreferrer">{t("Khám phá trên GitHub")} <ArrowUpRight size={15} /></a></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
