# Modello Permessi

Questo bot modella Discord come se fosse un virtual server TeamSpeak 3.

```text
Discord Server  -> Virtual Server TS3
Discord Member  -> Client TS3
Discord Channel -> Channel TS3
Ruolo Discord   -> Output sincronizzato dal bot
Database D1     -> Fonte della verita
```

## Tipi di gruppo

In questa fase sono implementati:

- Server Group
- Client Permission

Sono previsti nelle fasi successive:

- Channel Group
- Channel Permission
- Channel Client Permission

## Struttura di un permesso

Ogni permesso ha:

```text
permission_key
value_type: boolean | integer | power
value
grant_value
negated
skip
```

Esempio:

```text
i_group_member_add_power = 80
grant_value = 80
negated = false
skip = false
```

## Power e Needed Power

Una modifica passa quando:

```text
actor_power >= target_needed_power
```

Esempio:

```text
Admin:
  i_group_member_add_power = 80

Moderator:
  i_group_needed_member_add_power = 65
```

L'Admin puo assegnare Moderator perche `80 >= 65`.

## Grant Value

Il `grant_value` protegge la modifica dei permessi.

Per cambiare un permesso serve:

```text
i_permission_modify_power >= grant_value_del_permesso
```

Se il nuovo grant richiesto e piu alto del grant esistente, serve potere sufficiente anche per il nuovo grant.

## Negated

`negated = true` forza il permesso a falso o zero nel calcolo effettivo.

Esempio:

```text
Muted:
  b_send_messages = false
  negated = true
```

## Skip

`skip = true` e gia salvato nel modello dati. Diventa importante quando aggiungeremo Channel Group e Channel Permissions, per impedire override a livello canale.

## Gruppi seed

| Gruppo | Add Power | Remove Power | Modify Power | Permission Modify | Needed Add | Needed Remove | Needed Modify |
|---|---:|---:|---:|---:|---:|---:|---:|
| Root | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| Server Admin | 90 | 90 | 90 | 90 | 95 | 95 | 95 |
| Admin | 80 | 80 | 75 | 70 | 85 | 85 | 85 |
| Moderator | 60 | 60 | 30 | 20 | 65 | 65 | 65 |
| Helper | 35 | 35 | 0 | 0 | 45 | 45 | 45 |
| Member | 0 | 0 | 0 | 0 | 10 | 10 | 10 |
| Guest | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Regola di calcolo attuale

Per ora il calcolo effettivo globale fa:

1. Carica i Server Group dell'utente.
2. Se l'utente non ha gruppi, usa `Guest`.
3. Somma i permessi dei gruppi.
4. Applica i Client Permissions diretti.
5. Per booleani: `true` vince, salvo `negated`.
6. Per numeri/power: vince il valore piu alto, salvo `negated`.
7. `negated` forza falso o zero.

Quando aggiungeremo i Channel Group, `skip` impedira override a livello canale.
