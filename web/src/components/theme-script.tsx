/** Applies the saved theme before first paint. A Server Component, so the script is part of the HTML. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("hcc-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />;
}
