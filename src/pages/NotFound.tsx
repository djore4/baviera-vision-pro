import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Car } from "lucide-react";
import bmwLogo from "@/assets/bmw-logo.png";

/* Página 404 — com marca e um toque de humor de stand. */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md text-center space-y-5">
        <img src={bmwLogo} alt="BMW" className="mx-auto h-12 w-12 opacity-90" />

        <div className="flex items-center justify-center gap-3 text-primary">
          <span className="text-5xl font-black tracking-tight tabular-nums">404</span>
          <Car className="h-9 w-9" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-foreground">
            Este modelo ainda não chegou ao stand.
          </h1>
          <p className="text-sm text-muted-foreground">
            A página que procuras foi fazer um test drive e não voltou.
          </p>
        </div>

        <a
          href="/"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Voltar ao início
        </a>
      </div>
    </div>
  );
};

export default NotFound;
