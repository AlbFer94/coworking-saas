import {BrowserRouter, Routes, Route} from "react-router";
import AuthProvider from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Registrazione from './pages/Registrazione';
import PrivateRoute from './context/PrivateRoute';


function App(){
  return (  <AuthProvider>
    <BrowserRouter>
    <Routes>
      <Route path='/' element={<Landing/>} />
      <Route path='/login' element={<Login/>} />
      <Route path='/registrazione' element={<Registrazione/>} />
      <Route path='/private' element={<PrivateRoute><div>Private Content</div></PrivateRoute>} />
      </Routes>
      </BrowserRouter>
  </AuthProvider>
)
}

export default App;