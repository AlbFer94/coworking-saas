import {BrowserRouter, Routes, Route} from "react-router";
import AuthProvider from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Registrazione from './pages/Registrazione';
import PrivateRoute from './context/PrivateRoute';
import ThemeProvider from "./context/ThemeContext";
import Header from "./components/Header";
import ResetPassword from "./pages/ResetPassword";

function App(){  
  return (  <AuthProvider>
    <ThemeProvider>
    <BrowserRouter>
    <Header />
    <main className="pt-16">
    <Routes>
      <Route path='/' element={<Landing/>} />
      <Route path='/login' element={<Login/>} />
      <Route path='/registrazione' element={<Registrazione/>} />
      <Route path='/private' element={<PrivateRoute><div>Private Content</div></PrivateRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
      </main>
      </BrowserRouter>
      </ThemeProvider>
  </AuthProvider>
)
}

export default App;