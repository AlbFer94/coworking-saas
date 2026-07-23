import {app, PORT} from './app.js';


app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
