import styles from './register.module.css';
import FormLogin from './FormRegister';

export default function LoginPage() {
    return (
        <div className={styles.container}>
            <div className={styles.wrapper}>
                <h1 className={styles.titulo}>Sistema de gestão financeira</h1>
                <FormLogin />
            </div>
        </div>
    );
}