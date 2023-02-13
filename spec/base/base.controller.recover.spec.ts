import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';

import { BaseEntity } from './base.entity';
import { BaseModule } from './base.module';
import { BaseService } from './base.service';

describe('BaseController', () => {
    let app: INestApplication;
    let service: BaseService;
    let entities: BaseEntity[];

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                BaseModule,
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [BaseEntity],
                    synchronize: true,
                    logging: true,
                    logger: 'file',
                }),
            ],
        }).compile();
        app = moduleFixture.createNestApplication();

        service = moduleFixture.get<BaseService>(BaseService);
        entities = await Promise.all(
            ['name1', 'name2'].map((name: string) => service.repository.save(service.repository.create({ name }))),
        );

        await app.init();
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    describe('RECOVER', () => {
        it('should be provided /:id/recover', async () => {
            const routerPathList = app.getHttpServer()._events.request._router.stack.reduce((list: Record<string, string[]>, r) => {
                if (r.route?.path) {
                    for (const method of Object.keys(r.route.methods)) {
                        list[method] = list[method] ?? [];
                        list[method].push(r.route.path);
                    }
                }
                return list;
            }, {});
            expect(routerPathList.post).toEqual(expect.arrayContaining(['/base/:id/recover']));
        });

        it('recover the entity after delete', async () => {
            const id = entities[0].id;
            await request(app.getHttpServer()).get(`/base/${id}`).expect(HttpStatus.OK);

            // Delete
            await request(app.getHttpServer()).delete(`/base/${id}`).expect(HttpStatus.OK);

            // getOne -> NotFOUND
            await request(app.getHttpServer()).get(`/base/${id}`).expect(HttpStatus.NOT_FOUND);

            // getMany -> id가 없다.
            const { body } = await request(app.getHttpServer()).get('/base').expect(HttpStatus.OK);
            expect(body.data.some((entity) => entity.id === id)).toBeFalsy();

            // Recover
            const recoverResponse = await request(app.getHttpServer()).post(`/base/${id}/recover`).expect(HttpStatus.CREATED);
            expect(recoverResponse.body.deletedAt).toBeNull();

            // GetOne -> OK
            const getResponse = await request(app.getHttpServer()).get(`/base/${id}`).expect(HttpStatus.OK);
            expect(getResponse.body.deletedAt).toBeNull();
        });

        it('should be checked params type', async () => {
            await request(app.getHttpServer())
                .post(`/base/${Number('a')}/recover`)
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
