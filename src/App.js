import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from './server/firebase';

import Login from './resources/login/Login';
import AdminHomepage from './admin/homepage/homepage';
import WorkerHomepage from './worker/homepage/homepage';
import Carga from './resources/Carga/Carga';

function App() {
  const [user, setUser] = useState(null);
  const [rol, setRol] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          const userRef = doc(db, 'EMPLEADOS', currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setRol(data.rol);
            localStorage.setItem('userRole', data.rol);
            localStorage.setItem('userName', data.nombre);
            localStorage.setItem('userEmail', currentUser.email);
          } else {
            setRol(null);
          }
        } catch (err) {
          setRol(null);
        }
      } else {
        setUser(null);
        setRol(null);
        localStorage.clear();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const renderContent = () => {
    if (user && loading) return <Carga />;
    if (!user) return <Login />;
    if (rol === 'ADMINISTRADOR') return <AdminHomepage />;
    if (rol === 'EMPLEADO') return <WorkerHomepage />;
    return <Carga />;
  };

  return (
    <>
      {renderContent()}
    </>
  );
}

export default App;
