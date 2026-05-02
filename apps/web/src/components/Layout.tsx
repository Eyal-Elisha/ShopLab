import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ShoppingCart, User, LogOut, Shield, Search, Menu, X, Package, Bug, Crown, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const { totalItems } = useCart();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Removed global search handleSearch as we are using a dedicated search page now

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <span className="block font-display text-xl font-bold tracking-tight">ShopLab</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Security Template</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center max-w-md flex-1 mx-8">
            {/* Global search removed to avoid confusion on non-search pages */}
          </div>

          <nav className="hidden md:flex items-center gap-2">
            <Link to="/products">
              <Button variant="ghost" size="sm">Products</Button>
            </Link>
            <Link to="/challenges">
              <Button variant="ghost" size="sm">
                <Bug className="w-4 h-4 mr-1" /> Challenges
              </Button>
            </Link>
            {user ? (
              <>
                <Link to="/orders">
                  <Button variant="ghost" size="sm">Orders</Button>
                </Link>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="ghost" size="sm" className="text-primary">
                      <Shield className="w-4 h-4 mr-1" /> Admin
                    </Button>
                  </Link>
                )}
                <Link to="/vip">
                  <Button variant="ghost" size="sm" className="text-yellow-600 dark:text-yellow-400">
                    <Crown className="w-4 h-4 mr-1" /> VIP
                  </Button>
                </Link>
                <Link to="/cart" className="relative">
                  <Button variant="ghost" size="icon">
                    <ShoppingCart className="w-5 h-5" />
                    {totalItems > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                        {totalItems}
                      </span>
                    )}
                  </Button>
                </Link>
                <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                  >
                    {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </Button>
                  <Link to={`/profile/${user.id}`} className="text-sm text-muted-foreground hover:text-foreground">
                    {user.username}
                  </Link>
                  <Button variant="ghost" size="icon" onClick={handleLogout}>
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <Link to="/login">
                <Button size="sm">
                  <User className="w-4 h-4 mr-1" /> Sign In
                </Button>
              </Link>
            )}
          </nav>

          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t p-4 space-y-3 bg-card">
            {/* Global search removed for mobile as well */}
            <Link to="/products" onClick={() => setMobileMenuOpen(false)} className="block py-2">Products</Link>
            <Link to="/challenges" onClick={() => setMobileMenuOpen(false)} className="block py-2">Challenges</Link>
            {user ? (
              <>
                <Link to="/orders" onClick={() => setMobileMenuOpen(false)} className="block py-2">Orders</Link>
                <Link to={`/profile/${user.id}`} onClick={() => setMobileMenuOpen(false)} className="block py-2">Profile</Link>
                <Link to="/cart" onClick={() => setMobileMenuOpen(false)} className="block py-2">Cart ({totalItems})</Link>
                {isAdmin && <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-primary">Admin</Link>}
                <Link to="/vip" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-yellow-600 dark:text-yellow-400">VIP Dashboard</Link>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
                </button>
                <Button variant="outline" className="w-full" onClick={handleLogout}>Logout</Button>
              </>
            ) : (
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}><Button className="w-full">Sign In</Button></Link>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p className="font-display font-semibold text-foreground mb-1">ShopLab</p>
          <p>Course-ready security commerce sandbox for web, API, and interactive lab exercises.</p>
        </div>
      </footer>
    </div>
  );
}
